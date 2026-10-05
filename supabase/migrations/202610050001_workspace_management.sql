begin;

create table if not exists public.workspace_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','teacher','staff','student')),
  enabled boolean not null default true,
  can_mentor boolean not null default false,
  department text not null default '' check (length(department) <= 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (not can_mentor or role in ('admin','teacher','staff'))
);
alter table public.workspace_accounts enable row level security;
revoke all on public.workspace_accounts from public, anon, authenticated;
grant all on public.workspace_accounts to service_role;

create table if not exists public.workspace_settings (
  id boolean primary key default true check (id), registration_enabled boolean not null default true,
  features jsonb not null default '{"github":true,"figma":true,"miro":true,"research":true,"resource":true,"document":true,"blackbook":true}',
  updated_at timestamptz not null default now()
);
insert into public.workspace_settings(id) values (true) on conflict do nothing;
alter table public.workspace_settings enable row level security;
revoke all on public.workspace_settings from public, anon, authenticated;
grant all on public.workspace_settings to service_role;

create table if not exists public.workspace_management_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
  action text not null, subject text not null, created_at timestamptz not null default now()
);
alter table public.workspace_management_audit enable row level security;
revoke all on public.workspace_management_audit from public, anon, authenticated;
grant all on public.workspace_management_audit to service_role;

create or replace function public.workspace_account_role(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select case when enabled then role else 'disabled' end from public.workspace_accounts where user_id=p_user_id),'student');
$$;
revoke all on function public.workspace_account_role(uuid) from public, anon, authenticated;
grant execute on function public.workspace_account_role(uuid) to service_role;

create or replace function public.workspace_session_active(p_user_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.workspace_account_role(p_user_id) <> 'disabled' and exists (
    select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=p_session_id and s.user_id=p_user_id and (s.not_after is null or s.not_after>now())
      and coalesce(u.raw_app_meta_data->>'must_change_password','false') <> 'true');
$$;

create or replace function public.workspace_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_completed_password_setup() and public.workspace_account_role(auth.uid())='admin';
$$;
revoke all on function public.workspace_is_admin() from public, anon;
grant execute on function public.workspace_is_admin() to authenticated, service_role;
create or replace function public.workspace_is_educator()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_completed_password_setup() and public.workspace_account_role(auth.uid()) in ('teacher','staff');
$$;
revoke all on function public.workspace_is_educator() from public, anon;
grant execute on function public.workspace_is_educator() to authenticated;

create or replace function public.workspace_feature_access(p_user_id uuid, p_feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.workspace_account_role(p_user_id) <> 'disabled' and (
    public.workspace_account_role(p_user_id)='admin' or coalesce((select (features->>p_feature)::boolean from public.workspace_settings where id),false));
$$;
revoke all on function public.workspace_feature_access(uuid,text) from public, anon, authenticated;
grant execute on function public.workspace_feature_access(uuid,text) to service_role;
create or replace function public.workspace_feature_enabled(p_feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_completed_password_setup() and public.workspace_feature_access(auth.uid(),p_feature);
$$;
revoke all on function public.workspace_feature_enabled(text) from public, anon;
grant execute on function public.workspace_feature_enabled(text) to authenticated;
create or replace function public.workspace_signup_open()
returns boolean language sql stable security definer set search_path = '' as $$
  select registration_enabled from public.workspace_settings where id;
$$;
revoke all on function public.workspace_signup_open() from public, anon, authenticated;
grant execute on function public.workspace_signup_open() to service_role;

create or replace function public.workspace_sync_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('workspace_role',new.role,'workspace_enabled',new.enabled,'workspace_can_mentor',new.can_mentor)
    where id=new.user_id;
  if (tg_op='INSERT' and (new.role<>'student' or not new.enabled)) or (tg_op='UPDATE' and (new.role is distinct from old.role or new.enabled is distinct from old.enabled or new.can_mentor is distinct from old.can_mentor)) then
    delete from auth.sessions where user_id=new.user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.workspace_sync_account() from public, anon, authenticated;
drop trigger if exists workspace_sync_account on public.workspace_accounts;
create trigger workspace_sync_account after insert or update on public.workspace_accounts for each row execute function public.workspace_sync_account();

create or replace function public.workspace_bootstrap_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(7218501);
  if exists(select 1 from public.workspace_accounts where role='admin' and user_id<>p_user_id) then
    raise exception 'An administrator already exists; use account management';
  end if;
  insert into public.workspace_accounts(user_id,role,can_mentor) values(p_user_id,'admin',true)
    on conflict(user_id) do update set role='admin',enabled=true,can_mentor=true,updated_at=now();
end;
$$;
revoke all on function public.workspace_bootstrap_admin(uuid) from public, anon, authenticated;
grant execute on function public.workspace_bootstrap_admin(uuid) to service_role;

create or replace function public.workspace_register_account(p_actor uuid,p_user uuid,p_role text,p_mentor boolean,p_department text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(7218501);
  if public.workspace_account_role(p_actor)<>'admin' then raise exception 'Administrator access required'; end if;
  insert into public.workspace_accounts(user_id,role,can_mentor,department,created_by)
    values(p_user,p_role,p_mentor,p_department,p_actor);
  insert into public.workspace_management_audit(actor_id,action,subject) values(p_actor,'account.create',p_user::text);
end;
$$;
revoke all on function public.workspace_register_account(uuid,uuid,text,boolean,text) from public, anon, authenticated;
grant execute on function public.workspace_register_account(uuid,uuid,text,boolean,text) to service_role;

create or replace function public.workspace_update_account(p_user uuid,p_role text,p_enabled boolean,p_mentor boolean,p_department text,p_name text default null,p_college text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(7218501);
  if not public.workspace_is_admin() then raise exception 'Administrator access required'; end if;
  if p_user=auth.uid() and (p_role<>'admin' or not p_enabled) then raise exception 'You cannot remove your own administrator access'; end if;
  if not exists(select 1 from auth.users where id=p_user) then raise exception 'Account not found'; end if;
  if (p_name is not null and (length(trim(p_name)) not between 1 and 120)) or (p_college is not null and (length(trim(p_college)) not between 1 and 200)) then raise exception 'Enter valid account details'; end if;
  insert into public.workspace_accounts(user_id,role,enabled,can_mentor,department,created_by)
    values(p_user,p_role,p_enabled,p_mentor,p_department,auth.uid())
    on conflict(user_id) do update set role=p_role,enabled=p_enabled,can_mentor=p_mentor,department=p_department,updated_at=now();
  if p_name is not null or p_college is not null then
    update public.profiles set full_name=coalesce(p_name,full_name),college=coalesce(p_college,college) where id=p_user;
    update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)
      ||case when p_name is not null then jsonb_build_object('full_name',p_name) else '{}'::jsonb end
      ||case when p_college is not null then jsonb_build_object('college',p_college) else '{}'::jsonb end where id=p_user;
  end if;
  insert into public.workspace_management_audit(actor_id,action,subject) values(auth.uid(),'account.update',p_user::text);
end;
$$;
revoke all on function public.workspace_update_account(uuid,text,boolean,boolean,text,text,text) from public, anon;
grant execute on function public.workspace_update_account(uuid,text,boolean,boolean,text,text,text) to authenticated;

create or replace function public.workspace_manage_settings(p_registration boolean,p_features jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.workspace_is_admin() then raise exception 'Administrator access required'; end if;
  if jsonb_typeof(p_features)<>'object' or exists(select 1 from jsonb_each(p_features) where key not in ('github','figma','miro','research','resource','document','blackbook') or jsonb_typeof(value)<>'boolean') then
    raise exception 'Invalid feature settings';
  end if;
  update public.workspace_settings set registration_enabled=p_registration,features=features||p_features,updated_at=now() where id;
  insert into public.workspace_management_audit(actor_id,action,subject) values(auth.uid(),'settings.update','workspace');
end;
$$;
revoke all on function public.workspace_manage_settings(boolean,jsonb) from public, anon;
grant execute on function public.workspace_manage_settings(boolean,jsonb) to authenticated;

create or replace function public.workspace_revoke_user_sessions(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if not public.workspace_is_admin() then raise exception 'Administrator access required'; end if;
  if p_user=auth.uid() then raise exception 'Use your own sessions page for this account'; end if;
  delete from auth.sessions where user_id=p_user;
  get diagnostics affected=row_count;
  insert into public.workspace_management_audit(actor_id,action,subject) values(auth.uid(),'sessions.revoke',p_user::text);
  return affected;
end;
$$;
revoke all on function public.workspace_revoke_user_sessions(uuid) from public, anon;
grant execute on function public.workspace_revoke_user_sessions(uuid) to authenticated;

create or replace function public.workspace_list_accounts(p_search text default '',p_role text default '',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.workspace_is_admin() then raise exception 'Administrator access required'; end if;
  if p_page<1 or p_page>100000 or length(p_search)>160 then raise exception 'Invalid account page'; end if;
  with matching as (
    select p.id,p.email,p.full_name,p.college,coalesce(a.role,'student') as role,coalesce(a.enabled,true) as enabled,
      coalesce(a.can_mentor,false) as can_mentor,coalesce(a.department,'') as department
    from public.profiles p left join public.workspace_accounts a on p.id=a.user_id
    where (p_role='' or coalesce(a.role,'student')=p_role)
      and (p_search='' or position(lower(p_search) in lower(coalesce(p.full_name,'')||' '||coalesce(p.email,'')))>0)
  ), page as (select * from matching order by full_name nulls last,id limit 20 offset (p_page-1)*20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from matching)) into result;
  return result;
end;
$$;
revoke all on function public.workspace_list_accounts(text,text,integer) from public, anon;
grant execute on function public.workspace_list_accounts(text,text,integer) to authenticated;

create or replace function public.workspace_project_access(p_project_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_completed_password_setup() and (public.workspace_is_admin() or exists(select 1 from public.pms_squads p where p.id=p_project_id and (
    lower(p.leader_email)=lower(auth.jwt()->>'email') or p.mentor_id=auth.uid()::text or lower(p.mentor_id)=lower(auth.jwt()->>'email')
    or exists(select 1 from public.squad_members m where m.squad_id=p.id and lower(m.email)=lower(auth.jwt()->>'email')))));
$$;
create or replace function public.workspace_project_owner(p_project_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_completed_password_setup() and (public.workspace_is_admin() or exists(select 1 from public.pms_squads where id=p_project_id and lower(leader_email)=lower(auth.jwt()->>'email')));
$$;
drop policy if exists workspace_project_edit on public.pms_squads;
drop policy if exists workspace_project_insert on public.pms_squads;
create policy workspace_project_insert on public.pms_squads for insert to authenticated with check(public.workspace_is_admin() or lower(leader_email)=lower(auth.jwt()->>'email'));
drop policy if exists workspace_project_insert_scope on public.pms_squads;
create policy workspace_project_insert_scope on public.pms_squads as restrictive for insert to authenticated with check(public.workspace_is_admin() or lower(leader_email)=lower(auth.jwt()->>'email'));
create policy workspace_project_edit on public.pms_squads for update to authenticated using(public.workspace_project_owner(id)) with check(public.workspace_is_admin() or lower(leader_email)=lower(auth.jwt()->>'email'));
drop policy if exists workspace_project_edit_scope on public.pms_squads;
create policy workspace_project_edit_scope on public.pms_squads as restrictive for update to authenticated using(public.workspace_project_owner(id)) with check(public.workspace_is_admin() or lower(leader_email)=lower(auth.jwt()->>'email'));

create or replace function public.guard_workspace_mentor_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role()='authenticated' and (tg_op='INSERT' and new.mentor_id is not null or tg_op='UPDATE' and new.mentor_id is distinct from old.mentor_id) then
    if not public.workspace_is_admin() then raise exception 'Only an administrator can assign mentors'; end if;
    if new.mentor_id is not null and not exists(select 1 from public.workspace_accounts a join auth.users u on u.id=a.user_id
      where a.enabled and a.can_mentor and a.user_id::text=new.mentor_id and lower(u.email)<>lower(new.leader_email)) then
      raise exception 'Choose an enabled teacher or staff mentor other than the project lead';
    end if;
  end if;
  return new;
end;
$$;
create or replace function public.guard_workspace_milestone_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role()='authenticated' and not public.workspace_is_admin() and (
    (tg_op='INSERT' and (new.status in ('APPROVED','COMPLETED','COMPLETE','DONE','REVISION_REQUESTED') or new.score is not null or new.mentor_feedback is not null))
    or (tg_op='UPDATE' and ((new.status is distinct from old.status and new.status in ('APPROVED','COMPLETED','COMPLETE','DONE','REVISION_REQUESTED'))
      or old.status in ('APPROVED','COMPLETED','COMPLETE','DONE') or new.score is distinct from old.score or new.mentor_feedback is distinct from old.mentor_feedback))
  ) and not exists(select 1 from public.pms_squads p left join public.workspace_accounts a on a.user_id=auth.uid()
    where p.id=new.squad_id and (p.mentor_id=auth.uid()::text or lower(p.mentor_id)=lower(auth.jwt()->>'email'))
      and coalesce(a.enabled,true) and coalesce(a.can_mentor,true)) then raise exception 'Only the assigned mentor can change review decisions'; end if;
  return new;
end;
$$;
drop policy if exists library_owner on public.workspace_library;
create policy library_owner on public.workspace_library for all to authenticated
  using(public.workspace_feature_enabled(kind) and (user_id=auth.uid() or public.workspace_is_admin()))
  with check(public.workspace_feature_enabled(kind) and (user_id=auth.uid() or public.workspace_is_admin()));

create table if not exists public.workspace_repository_reports (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text references public.pms_squads(id) on delete set null,
  repository text not null, branch text not null, snapshot_at timestamptz not null, scope_since text not null,
  payload jsonb not null, loaded_commits integer not null, ai_marked integer not null, updated_at timestamptz not null default now(),
  unique(owner_id,repository,branch,snapshot_at,scope_since)
);
alter table public.workspace_repository_reports enable row level security;
revoke all on public.workspace_repository_reports from public, anon, authenticated;
grant select on public.workspace_repository_reports to authenticated;
grant all on public.workspace_repository_reports to service_role;
drop policy if exists report_reader on public.workspace_repository_reports;
create policy report_reader on public.workspace_repository_reports for select to authenticated using(
  public.workspace_feature_enabled('github') and (owner_id=auth.uid() or public.workspace_is_admin() or
    (public.workspace_is_educator() and public.workspace_project_access(project_id)))
);
create index if not exists workspace_reports_updated on public.workspace_repository_reports(updated_at desc,id);

create or replace function public.workspace_save_repository_report(p_owner uuid,p_project text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare report_id uuid; previous jsonb; combined jsonb; history jsonb; pages jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(p_owner::text||(p_payload->'github'->'repository'->>'name')));
  select id,payload into report_id,previous from public.workspace_repository_reports where owner_id=p_owner
    and repository=p_payload->'github'->'repository'->>'name' and branch=p_payload->'github'->>'branch'
    and snapshot_at=(p_payload->'github'->'window'->>'until')::timestamptz
    and scope_since=coalesce(p_payload->'github'->'window'->>'since','') for update;
  combined=p_payload;
  if report_id is not null then
    select coalesce(jsonb_agg(
      case when item->'stats' is null then item||coalesce((select jsonb_build_object('stats',old_item->'stats') from jsonb_array_elements(previous->'github'->'commits') old_item
        where old_item->>'sha'=item->>'sha' and old_item->'stats' is not null limit 1),'{}'::jsonb) else item end
      order by item->>'committedAt' desc),'[]'::jsonb) into history from (
      select distinct on (item->>'sha') item from jsonb_array_elements(coalesce(previous->'github'->'commits','[]')||(p_payload->'github'->'commits')) with ordinality as records(item,n)
      order by item->>'sha',n desc
    ) deduplicated;
    select jsonb_agg(value order by value) into pages from (select distinct value from jsonb_array_elements((previous->'github'->'pages')||(p_payload->'github'->'pages'))) unique_pages;
    combined=jsonb_set(jsonb_set(combined,'{github,commits}',history),'{github,pages}',pages);
    if not (combined->'github' ? 'intelligence') and previous->'github' ? 'intelligence' then combined=jsonb_set(combined,'{github,intelligence}',previous->'github'->'intelligence'); end if;
  end if;
  insert into public.workspace_repository_reports(owner_id,project_id,repository,branch,snapshot_at,scope_since,payload,loaded_commits,ai_marked)
    values(p_owner,p_project,p_payload->'github'->'repository'->>'name',p_payload->'github'->>'branch',(p_payload->'github'->'window'->>'until')::timestamptz,
      coalesce(p_payload->'github'->'window'->>'since',''),combined,jsonb_array_length(combined->'github'->'commits'),
      (select count(*) from jsonb_array_elements(combined->'github'->'commits') c where c->'aiAssistance'->>'flagged'='true'))
    on conflict(owner_id,repository,branch,snapshot_at,scope_since) do update set payload=excluded.payload,loaded_commits=excluded.loaded_commits,ai_marked=excluded.ai_marked,
      project_id=coalesce(excluded.project_id,public.workspace_repository_reports.project_id),updated_at=now()
    returning id into report_id;
  return report_id;
end;
$$;
revoke all on function public.workspace_save_repository_report(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.workspace_save_repository_report(uuid,text,jsonb) to service_role;

create or replace function public.workspace_report_change_stats(p_owner uuid,p_report uuid,p_repository text,p_stats jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare stored jsonb; updated jsonb;
begin
  select payload into stored from public.workspace_repository_reports where id=p_report and owner_id=p_owner and lower(repository)=lower(p_repository) for update;
  if stored is null then raise exception 'Saved analysis not found'; end if;
  select jsonb_agg(case when s.item is not null then jsonb_set(c.item,'{stats}',s.item->'stats') else c.item end order by c.n) into updated
    from jsonb_array_elements(stored->'github'->'commits') with ordinality c(item,n)
    left join lateral (select incoming.item from jsonb_array_elements(p_stats) as incoming(item) where incoming.item->>'sha'=c.item->>'sha' limit 1) s on true;
  update public.workspace_repository_reports set payload=jsonb_set(stored,'{github,commits}',coalesce(updated,'[]'::jsonb)),updated_at=now() where id=p_report;
end;
$$;
revoke all on function public.workspace_report_change_stats(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.workspace_report_change_stats(uuid,uuid,text,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
