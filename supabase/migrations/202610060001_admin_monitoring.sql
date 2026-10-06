begin;

-- Server-owned activity snapshots power the administrator's live monitor. A
-- heartbeat is written while a workspace is open, so administrators can see
-- the last page visited without exposing provider credentials.
create table if not exists public.workspace_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid,
  event_type text not null default 'heartbeat' check (length(event_type) between 1 and 64),
  route text not null default '' check (length(route) <= 300),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
alter table public.workspace_activity enable row level security;
revoke all on public.workspace_activity from public, anon, authenticated;
grant all on public.workspace_activity to service_role;
create index if not exists workspace_activity_user_time on public.workspace_activity(user_id, occurred_at desc);
create index if not exists workspace_activity_time on public.workspace_activity(occurred_at desc);
create index if not exists workspace_activity_event_time on public.workspace_activity(event_type, occurred_at desc);

create table if not exists public.workspace_provider_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('figma', 'miro')),
  title text not null,
  url text not null,
  payload jsonb not null,
  snapshot_at timestamptz not null default now()
);
alter table public.workspace_provider_reports enable row level security;
revoke all on public.workspace_provider_reports from public, anon, authenticated;
grant all on public.workspace_provider_reports to service_role;
create index if not exists workspace_provider_reports_owner on public.workspace_provider_reports(owner_id, snapshot_at desc);

-- Audit successful row changes in the database, including direct browser writes.
-- Route/heartbeat signals are client-reported; these mutation records are emitted
-- only after the database accepted the operation.
create or replace function public.workspace_capture_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; old_data jsonb; actor uuid; session uuid; changes jsonb;
begin
  row_data = case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_data = case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  actor = auth.uid();
  if actor is null and tg_table_name in ('integration_connections','workspace_repository_reports','workspace_provider_reports') then
    actor = coalesce(row_data->>'user_id',row_data->>'owner_id')::uuid;
  end if;
  if actor is null or not exists(select 1 from auth.users where id=actor) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  session = nullif(auth.jwt()->>'session_id','')::uuid;
  if tg_op='UPDATE' and (row_data-'updated_at')=(old_data-'updated_at') then return new; end if;
  select coalesce(jsonb_agg(key),'[]'::jsonb) into changes from jsonb_each(row_data)
    where key not in ('credentials','payload','notes','avatar_url') and value is distinct from old_data->key;
  insert into public.workspace_activity(user_id,session_id,event_type,metadata)
    values(actor,session,tg_table_name||'.'||lower(tg_op),jsonb_strip_nulls(jsonb_build_object(
      'record_id',row_data->>'id','project_id',coalesce(row_data->>'squad_id',row_data->>'project_id'),
      'title',coalesce(row_data->>'title',row_data->>'name',row_data->>'repository'),
      'status',row_data->>'status','previous_status',old_data->>'status','provider',row_data->>'provider',
      'owner_id',coalesce(row_data->>'user_id',row_data->>'owner_id'),'changed_fields',changes,'source','database'
    )));
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.workspace_capture_activity() from public, anon, authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','pms_squads','squad_members','milestones','workspace_library','integration_connections','workspace_repository_reports','workspace_provider_reports'] loop
    execute format('drop trigger if exists workspace_activity_capture on public.%I',table_name);
    execute format('create trigger workspace_activity_capture after insert or update or delete on public.%I for each row execute function public.workspace_capture_activity()',table_name);
  end loop;
end;
$$;

create or replace function public.workspace_monitoring_activity_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.workspace_is_admin() then raise exception 'Administrator access required'; end if;
  return jsonb_build_object(
    'latest',coalesce((select jsonb_agg(to_jsonb(latest)) from (
      select distinct on (user_id) user_id,session_id,event_type,route,occurred_at
      from public.workspace_activity where event_type in ('heartbeat','page_view') order by user_id,occurred_at desc
    ) latest),'[]'::jsonb),
    'activity_24h',(select count(*) from public.workspace_activity where occurred_at>=now()-interval '24 hours'),
    'trends',coalesce((select jsonb_agg(jsonb_build_object('at',bucket,'count',(select count(*) from public.workspace_activity a where a.occurred_at>=bucket and a.occurred_at<bucket+interval '1 hour')) order by bucket)
      from generate_series(date_trunc('hour',now())-interval '11 hours',date_trunc('hour',now()),interval '1 hour') bucket),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.workspace_monitoring_activity_summary() from public, anon;
grant execute on function public.workspace_monitoring_activity_summary() to authenticated;

-- auth.sessions lives outside the public schema and is intentionally only
-- reachable through this administrator-gated function. The API uses it for
-- exact active-device counts; activity history remains in workspace_activity.
create or replace function public.workspace_admin_list_sessions(p_user_id uuid default null)
returns table (
  user_id uuid,
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip text,
  current_session boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.workspace_is_admin() then raise exception 'Administrator access required'; end if;
  return query
    select s.user_id, s.id, s.created_at, coalesce(s.updated_at, s.created_at), s.user_agent,
      s.ip::text, s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
    from auth.sessions s
    where (p_user_id is null or s.user_id = p_user_id)
      and (s.not_after is null or s.not_after > now())
    order by coalesce(s.updated_at, s.created_at) desc;
end;
$$;
revoke all on function public.workspace_admin_list_sessions(uuid) from public, anon;
grant execute on function public.workspace_admin_list_sessions(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
