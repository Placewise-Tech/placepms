begin;

-- Personal timetable entries complement project milestones without changing
-- the existing project data model. They are private to the signed-in owner.
create table if not exists public.workspace_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  kind text not null default 'PERSONAL' check (kind in ('PERSONAL', 'TIMETABLE', 'MENTORSHIP', 'ACADEMIC')),
  project_id text references public.pms_squads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_calendar_event_time check (ends_at is null or ends_at >= starts_at)
);

create index if not exists workspace_calendar_events_owner_time
  on public.workspace_calendar_events(user_id, starts_at);

alter table public.workspace_calendar_events enable row level security;
revoke all on public.workspace_calendar_events from anon;
grant select, insert, update, delete on public.workspace_calendar_events to authenticated;

drop policy if exists workspace_calendar_events_owner on public.workspace_calendar_events;
create policy workspace_calendar_events_owner on public.workspace_calendar_events
  for all to authenticated
  using (user_id = auth.uid() and public.has_completed_password_setup())
  with check (user_id = auth.uid() and public.has_completed_password_setup());

drop trigger if exists workspace_calendar_events_updated_at on public.workspace_calendar_events;
create or replace function public.touch_workspace_calendar_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.touch_workspace_calendar_event() from public, anon;
create trigger workspace_calendar_events_updated_at
  before update on public.workspace_calendar_events
  for each row execute function public.touch_workspace_calendar_event();

commit;
