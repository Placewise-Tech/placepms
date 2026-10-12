begin;

-- Keep the high-frequency presence signal separate from the audit/event stream.
-- One row per authenticated device means a busy workspace updates a bounded
-- table instead of appending a permanent row every minute for every student.
create table if not exists public.workspace_presence (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  route text not null default '' check (length(route) <= 300),
  visibility text not null default 'visible' check (visibility in ('visible', 'hidden')),
  last_seen_at timestamptz not null default now()
);
alter table public.workspace_presence enable row level security;
revoke all on public.workspace_presence from public, anon, authenticated;
grant all on public.workspace_presence to service_role;
create index if not exists workspace_presence_seen on public.workspace_presence(last_seen_at desc);
create index if not exists workspace_presence_user_seen on public.workspace_presence(user_id, last_seen_at desc);

-- Write presence through the user's authenticated PostgREST connection. This
-- avoids an extra service-role round trip for every visible student heartbeat.
create or replace function public.workspace_touch_presence(p_route text default '', p_visibility text default 'visible')
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid; session uuid;
begin
  actor = auth.uid();
  session = nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  if actor is null or session is null or not public.has_completed_password_setup() then
    raise exception using errcode = '42501', message = 'Sign in again';
  end if;
  insert into public.workspace_presence(session_id,user_id,route,visibility,last_seen_at)
    values(session,actor,left(coalesce(p_route,''),300),case when p_visibility='visible' then 'visible' else 'hidden' end,now())
    on conflict (session_id) do update set route=excluded.route,visibility=excluded.visibility,last_seen_at=excluded.last_seen_at
      where public.workspace_presence.user_id=actor;
end;
$$;
revoke all on function public.workspace_touch_presence(text,text) from public, anon;
grant execute on function public.workspace_touch_presence(text,text) to authenticated;

-- These are the predicates used by the RLS functions and dashboard reads. The
-- expression indexes avoid a full table scan as the student population grows.
create index if not exists pms_squads_leader_email_lower on public.pms_squads(lower(leader_email));
create index if not exists pms_squads_mentor_id on public.pms_squads(mentor_id);
create index if not exists pms_squads_created_at_id on public.pms_squads(created_at desc, id);
create index if not exists squad_members_project_user on public.squad_members(squad_id, user_id);
create index if not exists squad_members_project_email_lower on public.squad_members(squad_id, lower(email));
create index if not exists squad_members_project_id on public.squad_members(squad_id, id);
create index if not exists milestones_project_status_due on public.milestones(squad_id, status, due_date);
create index if not exists milestones_project_id on public.milestones(squad_id, id);
create index if not exists profiles_email_lower on public.profiles(lower(email));
create index if not exists workspace_accounts_role on public.workspace_accounts(role, enabled);
create index if not exists workspace_activity_session_time on public.workspace_activity(session_id, occurred_at desc);

-- The service role calls this occasionally from the heartbeat path. It is safe
-- to run more than once and removes stale devices as well as old audit events.
create or replace function public.workspace_prune_capacity_data()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.workspace_presence p
   where p.last_seen_at < now() - interval '2 days'
      or not exists (select 1 from auth.sessions s where s.id = p.session_id);
  delete from public.workspace_activity
   where occurred_at < now() - interval '90 days';
end;
$$;
revoke all on function public.workspace_prune_capacity_data() from public, anon, authenticated;
grant execute on function public.workspace_prune_capacity_data() to service_role;

-- Read presence from the bounded table. It still joins the live Auth session so
-- revoked devices and temporary-login accounts never appear as online.
create or replace function public.workspace_system_metrics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  stats record; workload record; table_stats record; presence_stats record;
  max_connections integer; reserved_connections integer; usable_connections integer;
  cluster_connections bigint; tables jsonb;
begin
  if not public.workspace_is_admin() then raise exception 'Administrator access required'; end if;
  select * into stats from pg_catalog.pg_stat_database where datname=current_database();
  max_connections = current_setting('max_connections')::integer;
  reserved_connections = coalesce(nullif(current_setting('superuser_reserved_connections',true),''),'0')::integer
    + coalesce(nullif(current_setting('reserved_connections',true),''),'0')::integer;
  usable_connections = greatest(0,max_connections-reserved_connections);
  select count(*) into cluster_connections from pg_catalog.pg_stat_activity where backend_type='client backend';
  select count(*) filter (where state='active' and pid<>pg_backend_pid()) as running,
    count(*) filter (where state='idle') as idle,
    count(*) filter (where state like 'idle in transaction%') as idle_in_transaction,
    count(*) filter (where wait_event_type='Lock' and pid<>pg_backend_pid()) as waiting_on_lock,
    coalesce(max(greatest(0,extract(epoch from now()-query_start))) filter (where state='active' and pid<>pg_backend_pid()),0) as longest_query_seconds
    into workload from pg_catalog.pg_stat_activity where datname=current_database() and backend_type='client backend';
  select count(*) as table_count, coalesce(sum(n_live_tup),0) as live_rows, coalesce(sum(n_dead_tup),0) as dead_rows
    into table_stats from pg_catalog.pg_stat_user_tables where schemaname='public';
  select coalesce(jsonb_agg(to_jsonb(t) order by t.bytes desc,t.name),'[]'::jsonb) into tables from (
    select relname as name, pg_catalog.pg_total_relation_size(relid) as bytes, n_live_tup as live_rows, n_dead_tup as dead_rows,
      greatest(last_analyze,last_autoanalyze) as last_analyze, greatest(last_vacuum,last_autovacuum) as last_vacuum
    from pg_catalog.pg_stat_user_tables where schemaname='public'
    order by pg_catalog.pg_total_relation_size(relid) desc,relname limit 8
  ) t;

  with valid_sessions as (
    select s.id,s.user_id,coalesce(a.role,'student') as role from auth.sessions s
    join auth.users u on u.id=s.user_id left join public.workspace_accounts a on a.user_id=u.id
    where (s.not_after is null or s.not_after>now()) and coalesce(a.enabled,true)
      and coalesce(u.raw_app_meta_data->>'must_change_password','false')<>'true'
  ), online_people as (
    select distinct p.user_id,coalesce(s.role,'student') as role
    from public.workspace_presence p join valid_sessions s on s.id=p.session_id and s.user_id=p.user_id
    where p.last_seen_at between now()-interval '5 minutes' and now() and p.visibility='visible'
  )
  select (select count(*) from online_people) as online_users,
    (select count(*) from online_people where role='student') as online_students,
    (select count(*) from valid_sessions) as active_sessions,
    (select count(*) from auth.users u left join public.workspace_accounts a on a.user_id=u.id
      where coalesce(a.role,'student')='student' and coalesce(a.enabled,true)) as registered_students
    into presence_stats;

  return jsonb_build_object(
    'database',current_database(),'server_version',current_setting('server_version'),
    'active_connections',coalesce(stats.numbackends,0),'max_connections',max_connections,
    'connection_utilization_percent',case when usable_connections>0 then round(cluster_connections::numeric/usable_connections*100,2) else null end,
    'cache_hit_ratio_percent',case when coalesce(stats.blks_hit,0)+coalesce(stats.blks_read,0)>0 then round(stats.blks_hit::numeric/(stats.blks_hit+stats.blks_read)*100,2) else null end,
    'transactions_committed',stats.xact_commit,'transactions_rolled_back',stats.xact_rollback,
    'blocks_read',stats.blks_read,'blocks_hit',stats.blks_hit,'stats_reset',stats.stats_reset,
    'details',jsonb_build_object(
      'sampled_at',now(),
      'connections',jsonb_build_object('cluster',cluster_connections,'usable',usable_connections,'reserved',reserved_connections,
        'running',workload.running,'idle',workload.idle,'idle_in_transaction',workload.idle_in_transaction,
        'waiting_on_lock',workload.waiting_on_lock,'longest_query_seconds',workload.longest_query_seconds),
      'storage',jsonb_build_object('database_bytes',pg_catalog.pg_database_size(current_database()),'table_count',table_stats.table_count,
        'live_rows',table_stats.live_rows,'dead_rows',table_stats.dead_rows,'temp_bytes',stats.temp_bytes,'temp_files',stats.temp_files),
      'rows',jsonb_build_object('inserted',stats.tup_inserted,'updated',stats.tup_updated,'deleted',stats.tup_deleted),
      'deadlocks',stats.deadlocks,'presence',to_jsonb(presence_stats),'tables',tables
    )
  );
end;
$$;
revoke all on function public.workspace_system_metrics() from public, anon;
grant execute on function public.workspace_system_metrics() to authenticated;

notify pgrst, 'reload schema';
commit;
