begin;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github', 'figma', 'miro')),
  mode text not null check (mode in ('oauth', 'token')),
  account text not null,
  credentials text not null,
  expires_at timestamptz,
  refreshing_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
alter table public.integration_connections enable row level security;
revoke all on public.integration_connections from public, anon, authenticated;
grant all on public.integration_connections to service_role;

create or replace function public.workspace_claim_token_refresh(p_user_id uuid, p_provider text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  update public.integration_connections set refreshing_until = now() + interval '30 seconds'
    where user_id = p_user_id and provider = p_provider
      and (refreshing_until is null or refreshing_until < now());
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke all on function public.workspace_claim_token_refresh(uuid, text) from public, anon, authenticated;
grant execute on function public.workspace_claim_token_refresh(uuid, text) to service_role;

create table if not exists public.integration_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  provider text not null,
  verifier text not null,
  expires_at timestamptz not null
);
alter table public.integration_oauth_states enable row level security;
revoke all on public.integration_oauth_states from public, anon, authenticated;
grant all on public.integration_oauth_states to service_role;

create or replace function public.workspace_session_active(p_user_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id = p_session_id and s.user_id = p_user_id
      and (s.not_after is null or s.not_after > now())
      and coalesce(u.raw_app_meta_data ->> 'must_change_password', 'false') <> 'true');
$$;
revoke all on function public.workspace_session_active(uuid, uuid) from public, anon, authenticated;
grant execute on function public.workspace_session_active(uuid, uuid) to service_role;

-- Existing workspace policies now also reject revoked sessions immediately.
create or replace function public.has_completed_password_setup()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.workspace_session_active((select auth.uid()), nullif((select auth.jwt()) ->> 'session_id', '')::uuid);
$$;
revoke all on function public.has_completed_password_setup() from public, anon;
grant execute on function public.has_completed_password_setup() to authenticated, service_role;

create or replace function public.workspace_list_sessions()
returns table (id uuid, created_at timestamptz, last_active_at timestamptz, user_agent text, ip text, current_session boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.created_at, coalesce(s.updated_at, s.created_at), s.user_agent, s.ip::text,
    s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
  from auth.sessions s where s.user_id = (select auth.uid())
    and (s.not_after is null or s.not_after > now())
    and (select public.has_completed_password_setup())
  order by coalesce(s.updated_at, s.created_at) desc;
$$;
revoke all on function public.workspace_list_sessions() from public, anon;
grant execute on function public.workspace_list_sessions() to authenticated;

create or replace function public.workspace_revoke_session(p_session_id uuid default null, p_others boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if not public.has_completed_password_setup() then raise exception 'Sign in again'; end if;
  delete from auth.sessions where user_id = auth.uid()
    and ((p_others and id <> nullif(auth.jwt() ->> 'session_id', '')::uuid)
      or (not p_others and id = p_session_id));
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.workspace_revoke_session(uuid, boolean) from public, anon;
grant execute on function public.workspace_revoke_session(uuid, boolean) to authenticated;

create or replace function public.workspace_touch_session()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.has_completed_password_setup() then
    update auth.sessions set updated_at = now()
      where user_id = auth.uid() and id = nullif(auth.jwt() ->> 'session_id', '')::uuid;
  end if;
end;
$$;
revoke all on function public.workspace_touch_session() from public, anon;
grant execute on function public.workspace_touch_session() to authenticated;

create or replace function public.workspace_project_access(p_project_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_completed_password_setup() and exists (select 1 from public.pms_squads p where p.id = p_project_id and (
    lower(p.leader_email) = lower(auth.jwt() ->> 'email')
    or p.mentor_id = auth.uid()::text or lower(p.mentor_id) = lower(auth.jwt() ->> 'email')
    or exists (select 1 from public.squad_members m where m.squad_id = p.id and lower(m.email) = lower(auth.jwt() ->> 'email'))
  ));
$$;
create or replace function public.workspace_project_owner(p_project_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_completed_password_setup() and exists (select 1 from public.pms_squads where id = p_project_id and lower(leader_email) = lower(auth.jwt() ->> 'email'));
$$;
revoke all on function public.workspace_project_access(text), public.workspace_project_owner(text) from public, anon;
grant execute on function public.workspace_project_access(text), public.workspace_project_owner(text) to authenticated;

create or replace function public.guard_workspace_mentor_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and
    (new.mentor_id = auth.uid()::text or lower(new.mentor_id) = lower(new.leader_email))
  then raise exception 'The project lead cannot be their own reviewing mentor'; end if;
  return new;
end;
$$;
revoke all on function public.guard_workspace_mentor_assignment() from public, anon, authenticated;
drop trigger if exists workspace_guard_mentor on public.pms_squads;
create trigger workspace_guard_mentor before insert or update of mentor_id on public.pms_squads
for each row execute function public.guard_workspace_mentor_assignment();

-- Explicitly support leads, members and assigned mentors; restrictive scopes
-- also constrain any older permissive policies on these workspace tables.
drop policy if exists workspace_project_read on public.pms_squads;
create policy workspace_project_read on public.pms_squads for select to authenticated using (
  lower(leader_email) = lower(auth.jwt() ->> 'email') or mentor_id = auth.uid()::text
  or lower(mentor_id) = lower(auth.jwt() ->> 'email') or public.workspace_project_access(id)
);
drop policy if exists workspace_project_read_scope on public.pms_squads;
create policy workspace_project_read_scope on public.pms_squads as restrictive for select to authenticated using (
  lower(leader_email) = lower(auth.jwt() ->> 'email') or mentor_id = auth.uid()::text
  or lower(mentor_id) = lower(auth.jwt() ->> 'email') or public.workspace_project_access(id)
);
drop policy if exists workspace_project_insert on public.pms_squads;
create policy workspace_project_insert on public.pms_squads for insert to authenticated with check (lower(leader_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists workspace_project_insert_scope on public.pms_squads;
create policy workspace_project_insert_scope on public.pms_squads as restrictive for insert to authenticated with check (lower(leader_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists workspace_project_edit on public.pms_squads;
create policy workspace_project_edit on public.pms_squads for update to authenticated using (public.workspace_project_owner(id)) with check (lower(leader_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists workspace_project_edit_scope on public.pms_squads;
create policy workspace_project_edit_scope on public.pms_squads as restrictive for update to authenticated using (public.workspace_project_owner(id)) with check (lower(leader_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists workspace_project_delete_scope on public.pms_squads;
create policy workspace_project_delete_scope on public.pms_squads as restrictive for delete to authenticated using (public.workspace_project_owner(id));

drop policy if exists workspace_milestone_access on public.milestones;
create policy workspace_milestone_access on public.milestones for all to authenticated using (public.workspace_project_access(squad_id)) with check (public.workspace_project_access(squad_id));
drop policy if exists workspace_milestone_scope on public.milestones;
create policy workspace_milestone_scope on public.milestones as restrictive for all to authenticated using (public.workspace_project_access(squad_id)) with check (public.workspace_project_access(squad_id));
drop policy if exists workspace_milestone_delete_scope on public.milestones;
create policy workspace_milestone_delete_scope on public.milestones as restrictive for delete to authenticated using (public.workspace_project_owner(squad_id));

drop policy if exists workspace_member_read on public.squad_members;
create policy workspace_member_read on public.squad_members for select to authenticated using (public.workspace_project_access(squad_id));
drop policy if exists workspace_member_read_scope on public.squad_members;
create policy workspace_member_read_scope on public.squad_members as restrictive for select to authenticated using (public.workspace_project_access(squad_id));
drop policy if exists workspace_member_write_scope on public.squad_members;
create policy workspace_member_write_scope on public.squad_members as restrictive for insert to authenticated with check (public.workspace_project_owner(squad_id));
drop policy if exists workspace_member_update_scope on public.squad_members;
create policy workspace_member_update_scope on public.squad_members as restrictive for update to authenticated using (public.workspace_project_owner(squad_id)) with check (public.workspace_project_owner(squad_id));
drop policy if exists workspace_member_delete_scope on public.squad_members;
create policy workspace_member_delete_scope on public.squad_members as restrictive for delete to authenticated using (public.workspace_project_owner(squad_id));

-- Review decisions cannot be forged through direct browser database requests.
create or replace function public.guard_workspace_milestone_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and (
    (tg_op = 'INSERT' and (new.status in ('APPROVED', 'COMPLETED', 'COMPLETE', 'DONE', 'REVISION_REQUESTED') or new.score is not null or new.mentor_feedback is not null))
    or (tg_op = 'UPDATE' and (
      (new.status is distinct from old.status and new.status in ('APPROVED', 'COMPLETED', 'COMPLETE', 'DONE', 'REVISION_REQUESTED'))
      or old.status in ('APPROVED', 'COMPLETED', 'COMPLETE', 'DONE')
      or new.score is distinct from old.score or new.mentor_feedback is distinct from old.mentor_feedback
    ))
  ) and not exists (
    select 1 from public.pms_squads p where p.id = new.squad_id
      and (p.mentor_id = auth.uid()::text or lower(p.mentor_id) = lower(auth.jwt() ->> 'email'))
  ) then raise exception 'Only the assigned mentor can change review decisions'; end if;
  return new;
end;
$$;
revoke all on function public.guard_workspace_milestone_review() from public, anon, authenticated;
drop trigger if exists workspace_guard_review on public.milestones;
create trigger workspace_guard_review before insert or update on public.milestones
for each row execute function public.guard_workspace_milestone_review();

create table if not exists public.workspace_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('research', 'resource', 'document')),
  title text not null check (length(title) between 1 and 200),
  url text check (url is null or url ~ '^https?://'),
  notes text not null default '' check (length(notes) <= 20000),
  tags text[] not null default '{}',
  project_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workspace_library enable row level security;
grant select, insert, update, delete on public.workspace_library to authenticated;
drop policy if exists library_owner on public.workspace_library;
create policy library_owner on public.workspace_library for all to authenticated
  using (user_id = (select auth.uid()) and (select public.has_completed_password_setup()))
  with check (user_id = (select auth.uid()) and (select public.has_completed_password_setup()));
create index if not exists workspace_library_owner_kind on public.workspace_library(user_id, kind, updated_at desc);

-- Per-account provider requests are bounded across serverless instances.
create table if not exists public.workspace_api_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null, requests integer not null
);
alter table public.workspace_api_limits enable row level security;
revoke all on public.workspace_api_limits from public, anon, authenticated;
grant all on public.workspace_api_limits to service_role;
create or replace function public.claim_workspace_request(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare amount integer;
begin
  insert into public.workspace_api_limits as limits values (p_user_id, now(), 1)
  on conflict (user_id) do update set
    requests = case when limits.window_start < now() - interval '1 minute' then 1 else limits.requests + 1 end,
    window_start = case when limits.window_start < now() - interval '1 minute' then now() else limits.window_start end
  returning requests into amount;
  return amount <= 30;
end;
$$;
revoke all on function public.claim_workspace_request(uuid) from public, anon, authenticated;
grant execute on function public.claim_workspace_request(uuid) to service_role;

commit;
