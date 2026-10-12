begin;

-- Aggregate workload only: never expose SQL text, client addresses, or sessions.
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

  -- Match heartbeat to its actual unexpired session so old/revoked devices and
  -- multiple tabs cannot inflate the online student count.
  with valid_sessions as (
    select s.id,s.user_id,coalesce(a.role,'student') as role from auth.sessions s
    join auth.users u on u.id=s.user_id left join public.workspace_accounts a on a.user_id=u.id
    where (s.not_after is null or s.not_after>now()) and coalesce(a.enabled,true)
      and coalesce(u.raw_app_meta_data->>'must_change_password','false')<>'true'
  ), online_people as (
    select distinct s.user_id,s.role from public.workspace_activity a join valid_sessions s on s.id=a.session_id and s.user_id=a.user_id
    where a.occurred_at between now()-interval '5 minutes' and now()
      and a.event_type in ('heartbeat','page_view') and a.metadata->>'visibility'='visible'
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
