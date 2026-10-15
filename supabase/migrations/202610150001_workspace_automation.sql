begin;

-- Cloud-run automation is deliberately separate from browser sessions. A task
-- can therefore be claimed and executed after every laptop and local agent are
-- offline. The first execution adapters are milestone audits and public HTTP
-- checks; arbitrary code execution belongs in a separately hosted worker.
create table if not exists public.workspace_automation_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.pms_squads(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  task_type text not null check (task_type in ('MILESTONE_AUDIT','HTTP_CHECK')),
  target_url text check (target_url is null or (length(target_url) <= 2000 and target_url ~ '^https?://[^/@[:space:]]+([/?#]|$)')),
  frequency text not null default 'ONCE' check (frequency in ('ONCE','DAILY','WEEKLY')),
  -- One-time tasks set this to null after their first execution. Recurring
  -- tasks keep the next scheduled timestamp.
  next_run_at timestamptz,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','COMPLETED','FAILED')),
  locked_until timestamptz,
  last_run_at timestamptz,
  last_status text check (last_status is null or last_status in ('PASS','FAIL','ERROR')),
  last_error text not null default '' check (length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((task_type = 'HTTP_CHECK' and target_url is not null) or (task_type = 'MILESTONE_AUDIT' and target_url is null))
);

create table if not exists public.workspace_automation_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.workspace_automation_tasks(id) on delete cascade,
  project_id text not null references public.pms_squads(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  scheduled_for timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('PASS','FAIL','ERROR')),
  summary text not null check (length(trim(summary)) between 1 and 1000),
  details jsonb not null default '{}'::jsonb,
  error text not null default '' check (length(error) <= 2000),
  unique (task_id, scheduled_for)
);

create table if not exists public.workspace_automation_work_items (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.pms_squads(id) on delete cascade,
  report_id uuid references public.workspace_automation_runs(id) on delete set null,
  manager_id uuid not null references auth.users(id) on delete cascade,
  developer_id uuid not null references auth.users(id) on delete cascade,
  assignee_role text not null default 'DEVELOPER' check (assignee_role in ('DEVELOPER','TESTER')),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  due_at timestamptz,
  status text not null default 'ASSIGNED' check (status in ('ASSIGNED','IN_PROGRESS','DONE','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep this migration safe to re-run after an earlier draft was applied.
alter table public.workspace_automation_tasks alter column next_run_at drop not null;
alter table public.workspace_automation_work_items add column if not exists assignee_role text not null default 'DEVELOPER';
alter table public.workspace_automation_work_items drop constraint if exists workspace_automation_work_items_assignee_role_check;
alter table public.workspace_automation_work_items add constraint workspace_automation_work_items_assignee_role_check check (assignee_role in ('DEVELOPER','TESTER'));

create index if not exists workspace_automation_due on public.workspace_automation_tasks(status, next_run_at, locked_until);
create index if not exists workspace_automation_project on public.workspace_automation_tasks(project_id, created_at desc);
create index if not exists workspace_automation_runs_project on public.workspace_automation_runs(project_id, started_at desc);
create index if not exists workspace_automation_runs_task on public.workspace_automation_runs(task_id, started_at desc);
create index if not exists workspace_automation_work_project on public.workspace_automation_work_items(project_id, updated_at desc);
create index if not exists workspace_automation_work_developer on public.workspace_automation_work_items(developer_id, status, updated_at desc);

alter table public.workspace_automation_tasks enable row level security;
alter table public.workspace_automation_runs enable row level security;
alter table public.workspace_automation_work_items enable row level security;
revoke all on public.workspace_automation_tasks, public.workspace_automation_runs, public.workspace_automation_work_items from public, anon, authenticated;
grant select, insert, update on public.workspace_automation_tasks to authenticated;
grant select on public.workspace_automation_runs to authenticated;
grant select, insert, update on public.workspace_automation_work_items to authenticated;
grant all on public.workspace_automation_tasks, public.workspace_automation_runs, public.workspace_automation_work_items to service_role;

create or replace function public.workspace_automation_manager(p_project_id text, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pms_squads p
    where p.id = p_project_id and (
      lower(p.leader_email) = lower((select email from auth.users where id = p_user_id))
      or p.mentor_id = p_user_id::text
      or lower(p.mentor_id) = lower((select email from auth.users where id = p_user_id))
      or exists (select 1 from public.workspace_accounts a where a.user_id = p_user_id and a.enabled and a.role = 'admin')
    )
  );
$$;

create or replace function public.workspace_automation_developer(p_project_id text, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pms_squads p
    where p.id = p_project_id and lower(p.leader_email) = lower((select email from auth.users where id = p_user_id))
  ) or exists (
    select 1 from public.squad_members m
    where m.squad_id = p_project_id and (
      m.user_id = p_user_id or (m.user_id is null and lower(m.email) = lower((select email from auth.users where id = p_user_id)))
    )
  );
$$;

revoke all on function public.workspace_automation_manager(text, uuid), public.workspace_automation_developer(text, uuid) from public, anon;
grant execute on function public.workspace_automation_manager(text, uuid), public.workspace_automation_developer(text, uuid) to authenticated, service_role;

create or replace function public.guard_workspace_automation_task()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' and new.created_by <> auth.uid() then
      raise exception using errcode = '42501', message = 'The automation creator must be the signed-in account';
    end if;
    if not public.workspace_automation_manager(new.project_id, new.manager_id) then
      raise exception using errcode = '42501', message = 'Choose the project lead, assigned mentor, or administrator as manager';
    end if;
  end if;
  if new.task_type = 'HTTP_CHECK' and new.target_url is null then
    raise exception using errcode = '22023', message = 'An HTTP check needs a target URL';
  end if;
  if new.task_type = 'MILESTONE_AUDIT' and new.target_url is not null then
    raise exception using errcode = '22023', message = 'A milestone audit cannot use a target URL';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.guard_workspace_automation_task() from public, anon, authenticated;
drop trigger if exists workspace_guard_automation_task on public.workspace_automation_tasks;
create trigger workspace_guard_automation_task before insert or update on public.workspace_automation_tasks for each row execute function public.guard_workspace_automation_task();

create or replace function public.guard_workspace_automation_work_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      if not public.workspace_automation_manager(new.project_id, auth.uid()) then
        raise exception using errcode = '42501', message = 'Only the project manager can assign automated follow-up work';
      end if;
      if new.manager_id <> auth.uid() then
        raise exception using errcode = '42501', message = 'The signed-in manager must own the assignment';
      end if;
    elsif auth.uid() = old.developer_id then
      -- Developers and testers may update progress, but cannot rewrite the
      -- assignment, report, project, or due date that the manager created.
      if new.project_id is distinct from old.project_id or new.report_id is distinct from old.report_id or new.manager_id is distinct from old.manager_id or new.developer_id is distinct from old.developer_id or new.assignee_role is distinct from old.assignee_role or new.title is distinct from old.title or new.description is distinct from old.description or new.due_at is distinct from old.due_at then
        raise exception using errcode = '42501', message = 'Assigned developers and testers can only update work status';
      end if;
    elsif not public.workspace_automation_manager(new.project_id, auth.uid()) then
      raise exception using errcode = '42501', message = 'Only the project manager can assign automated follow-up work';
    end if;
    if not public.workspace_automation_developer(new.project_id, new.developer_id) then
      raise exception using errcode = '22023', message = 'Choose a registered project developer or tester';
    end if;
  end if;
  if new.report_id is not null and not exists (select 1 from public.workspace_automation_runs r where r.id = new.report_id and r.project_id = new.project_id) then
    raise exception using errcode = '22023', message = 'The automation report must belong to the selected project';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.guard_workspace_automation_work_item() from public, anon, authenticated;
drop trigger if exists workspace_guard_automation_work_item on public.workspace_automation_work_items;
create trigger workspace_guard_automation_work_item before insert or update on public.workspace_automation_work_items for each row execute function public.guard_workspace_automation_work_item();

drop policy if exists workspace_automation_task_read on public.workspace_automation_tasks;
create policy workspace_automation_task_read on public.workspace_automation_tasks for select to authenticated using (public.workspace_project_access(project_id));
drop policy if exists workspace_automation_task_insert on public.workspace_automation_tasks;
create policy workspace_automation_task_insert on public.workspace_automation_tasks for insert to authenticated with check (created_by = auth.uid() and public.workspace_project_access(project_id) and public.workspace_automation_manager(project_id, manager_id));
drop policy if exists workspace_automation_task_update on public.workspace_automation_tasks;
create policy workspace_automation_task_update on public.workspace_automation_tasks for update to authenticated using (public.workspace_automation_manager(project_id, auth.uid())) with check (public.workspace_automation_manager(project_id, manager_id));

drop policy if exists workspace_automation_run_read on public.workspace_automation_runs;
create policy workspace_automation_run_read on public.workspace_automation_runs for select to authenticated using (public.workspace_project_access(project_id));

drop policy if exists workspace_automation_work_read on public.workspace_automation_work_items;
create policy workspace_automation_work_read on public.workspace_automation_work_items for select to authenticated using (public.workspace_project_access(project_id) and (manager_id = auth.uid() or developer_id = auth.uid() or public.workspace_is_admin()));
drop policy if exists workspace_automation_work_insert on public.workspace_automation_work_items;
create policy workspace_automation_work_insert on public.workspace_automation_work_items for insert to authenticated with check (manager_id = auth.uid() and public.workspace_automation_manager(project_id, auth.uid()) and public.workspace_automation_developer(project_id, developer_id));
drop policy if exists workspace_automation_work_update on public.workspace_automation_work_items;
create policy workspace_automation_work_update on public.workspace_automation_work_items for update to authenticated using (manager_id = auth.uid() or developer_id = auth.uid() or public.workspace_is_admin()) with check (manager_id = auth.uid() or developer_id = auth.uid() or public.workspace_is_admin());

-- Claims are short leases. If a serverless invocation dies, a later cron run
-- can reclaim the task instead of leaving it permanently stuck.
create or replace function public.workspace_claim_due_automation_tasks(p_limit integer default 10)
returns table(id uuid, project_id text, manager_id uuid, title text, description text, task_type text, target_url text, frequency text, scheduled_for timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'Service role required'; end if;
  if p_limit < 1 or p_limit > 25 then raise exception using errcode = '22023', message = 'Invalid automation claim limit'; end if;
  return query
  with due as (
    select t.id from public.workspace_automation_tasks t
    where t.status = 'ACTIVE' and t.next_run_at <= now() and (t.locked_until is null or t.locked_until < now())
    order by t.next_run_at, t.id limit p_limit for update skip locked
  )
  update public.workspace_automation_tasks t
  set locked_until = now() + interval '5 minutes', updated_at = now()
  from due where t.id = due.id
  returning t.id, t.project_id, t.manager_id, t.title, t.description, t.task_type, t.target_url, t.frequency, t.next_run_at;
end;
$$;

create or replace function public.workspace_complete_automation_task(p_task_id uuid, p_success boolean, p_status text, p_error text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare task_row public.workspace_automation_tasks%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception using errcode = '42501', message = 'Service role required'; end if;
  if p_status not in ('PASS','FAIL','ERROR') then raise exception using errcode = '22023', message = 'Invalid automation result'; end if;
  select * into task_row from public.workspace_automation_tasks where id = p_task_id for update;
  if not found then return; end if;
  update public.workspace_automation_tasks set
    status = case when task_row.frequency = 'ONCE' then case when p_success then 'COMPLETED' else 'FAILED' end else 'ACTIVE' end,
    next_run_at = case when task_row.frequency = 'ONCE' then null when task_row.next_run_at + case task_row.frequency when 'DAILY' then interval '1 day' else interval '7 days' end <= now() then now() + case task_row.frequency when 'DAILY' then interval '1 day' else interval '7 days' end else task_row.next_run_at + case task_row.frequency when 'DAILY' then interval '1 day' else interval '7 days' end end,
    locked_until = null,
    last_run_at = now(),
    last_status = p_status,
    last_error = left(coalesce(p_error, ''), 2000),
    updated_at = now()
  where id = p_task_id;
end;
$$;
revoke all on function public.workspace_claim_due_automation_tasks(integer), public.workspace_complete_automation_task(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.workspace_claim_due_automation_tasks(integer), public.workspace_complete_automation_task(uuid, boolean, text, text) to service_role;

create or replace function public.notify_workspace_automation_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_notifications(user_id, project_id, kind, title, body)
  values (new.manager_id, new.project_id, 'automation.report', case when new.status = 'PASS' then 'Automated check passed' else 'Automated check needs attention' end, left(new.summary, 1000));
  return new;
end;
$$;
revoke all on function public.notify_workspace_automation_report() from public, anon, authenticated;
drop trigger if exists workspace_notify_automation_report on public.workspace_automation_runs;
create trigger workspace_notify_automation_report after insert on public.workspace_automation_runs for each row execute function public.notify_workspace_automation_report();

create or replace function public.notify_workspace_automation_work_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.workspace_notifications(user_id, project_id, kind, title, body)
    values (new.developer_id, new.project_id, 'automation.assignment', 'Automated follow-up assigned', left(new.title || ' · ' || new.description, 1000));
  end if;
  return new;
end;
$$;
revoke all on function public.notify_workspace_automation_work_item() from public, anon, authenticated;
drop trigger if exists workspace_notify_automation_work_item on public.workspace_automation_work_items;
create trigger workspace_notify_automation_work_item after insert on public.workspace_automation_work_items for each row execute function public.notify_workspace_automation_work_item();

commit;
