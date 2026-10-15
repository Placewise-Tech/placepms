begin;

-- New records only: existing submission links and historical decisions are not
-- backfilled as verified evidence. Verification attests to the stored record.
create table if not exists public.workspace_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.pms_squads(id) on delete cascade,
  milestone_id text,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'LINK' check (kind in ('LINK','DOCUMENT','DEMO','REPOSITORY','NOTE')),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  url text check (url is null or (length(url) <= 2000 and url ~ '^https?://[^/@[:space:]]+([/?#]|$)')),
  verified boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'NOTE' or url is not null)
);
create table if not exists public.workspace_comments (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.pms_squads(id) on delete cascade,
  milestone_id text,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 20),
  created_at timestamptz not null default now()
);
create table if not exists public.workspace_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.pms_squads(id) on delete cascade,
  milestone_id text,
  kind text not null check (length(kind) between 1 and 80),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 1000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists workspace_evidence_project_created on public.workspace_evidence(project_id, created_at desc, id);
create index if not exists workspace_evidence_milestone on public.workspace_evidence(milestone_id);
create index if not exists workspace_comments_project_created on public.workspace_comments(project_id, created_at desc, id);
create index if not exists workspace_comments_milestone on public.workspace_comments(milestone_id);
create index if not exists workspace_notifications_user_created on public.workspace_notifications(user_id, created_at desc, id);
create index if not exists workspace_notifications_unread on public.workspace_notifications(user_id, created_at desc) where read_at is null;
create index if not exists workspace_notifications_project on public.workspace_notifications(project_id);
create index if not exists workspace_notifications_milestone on public.workspace_notifications(milestone_id);
alter table public.workspace_evidence enable row level security;
alter table public.workspace_comments enable row level security;
alter table public.workspace_notifications enable row level security;
revoke all on public.workspace_evidence, public.workspace_comments, public.workspace_notifications from public, anon, authenticated;
grant select, insert, delete on public.workspace_evidence, public.workspace_comments to authenticated;
grant update(verified) on public.workspace_evidence to authenticated;
grant select on public.workspace_notifications to authenticated;
grant all on public.workspace_evidence, public.workspace_comments, public.workspace_notifications to service_role;

create or replace function public.workspace_evidence_reviewer(p_project_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_completed_password_setup() and (public.workspace_is_admin() or exists (
    select 1 from public.pms_squads p left join public.workspace_accounts a on a.user_id = auth.uid()
    where p.id = p_project_id and (p.mentor_id = auth.uid()::text or lower(p.mentor_id) = lower(auth.jwt()->>'email'))
      and coalesce(a.enabled, true) and coalesce(a.can_mentor, true)
  ));
$$;
revoke all on function public.workspace_evidence_reviewer(text) from public, anon;
grant execute on function public.workspace_evidence_reviewer(text) to authenticated;

-- This helper is private: arbitrary callers cannot enumerate another project's
-- identities. Legacy members match email only when user_id has not been set.
create or replace function public.workspace_signal_people(p_project_id text)
returns table(id uuid, name text) language sql stable security definer set search_path = '' as $$
  select u.id, coalesce(nullif(pr.full_name,''), u.email)
  from auth.users u left join public.profiles pr on pr.id = u.id
  left join public.workspace_accounts a on a.user_id = u.id
  where coalesce(a.enabled,true) and exists (
    select 1 from public.pms_squads p where p.id = p_project_id and (
      lower(p.leader_email) = lower(u.email) or p.mentor_id = u.id::text or lower(p.mentor_id) = lower(u.email)
      or exists(select 1 from public.squad_members m where m.squad_id = p.id and
        (m.user_id = u.id or (m.user_id is null and lower(m.email) = lower(u.email))))
    )
  );
$$;
revoke all on function public.workspace_signal_people(text) from public, anon, authenticated;
create or replace function public.workspace_comment_people(p_project_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.workspace_project_access(p_project_id) then raise exception using errcode='42501', message='Project access required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(p)) from public.workspace_signal_people(p_project_id) p),'[]'::jsonb);
end;
$$;
revoke all on function public.workspace_comment_people(text) from public, anon;
grant execute on function public.workspace_comment_people(text) to authenticated;

create or replace function public.guard_workspace_signal_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.milestone_id is not null and not exists(select 1 from public.milestones m where m.id::text = new.milestone_id and m.squad_id = new.project_id) then
    raise exception using errcode='22023', message='Choose a milestone in this project';
  end if;
  if tg_table_name = 'workspace_comments' then
    if exists(select 1 from unnest(new.mentions) v(id) where v.id is null or not exists(select 1 from public.workspace_signal_people(new.project_id) p where p.id = v.id)) then
      raise exception using errcode='22023', message='Mention only an enabled person connected to this project';
    end if;
    new.mentions := array(select distinct v from unnest(new.mentions) v);
  end if;
  if auth.role() = 'authenticated' then new.created_at = now(); end if;
  return new;
end;
$$;
revoke all on function public.guard_workspace_signal_insert() from public, anon, authenticated;
drop trigger if exists workspace_guard_evidence_insert on public.workspace_evidence;
create trigger workspace_guard_evidence_insert before insert on public.workspace_evidence for each row execute function public.guard_workspace_signal_insert();
drop trigger if exists workspace_guard_comment_insert on public.workspace_comments;
create trigger workspace_guard_comment_insert before insert on public.workspace_comments for each row execute function public.guard_workspace_signal_insert();

create or replace function public.guard_workspace_evidence_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.verified or new.verified_by is not null or new.verified_at is not null then
      raise exception using errcode='42501', message='Save evidence before requesting mentor verification';
    end if;
  elsif new.verified is distinct from old.verified then
    if not public.workspace_evidence_reviewer(new.project_id) then raise exception using errcode='42501', message='Only the assigned mentor can verify evidence'; end if;
    if new.verified and new.author_id = auth.uid() then raise exception using errcode='42501', message='You cannot verify your own evidence'; end if;
    new.verified_by = case when new.verified then auth.uid() else null end;
    new.verified_at = case when new.verified then now() else null end;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.guard_workspace_evidence_verification() from public, anon, authenticated;
drop trigger if exists workspace_guard_evidence_verification on public.workspace_evidence;
create trigger workspace_guard_evidence_verification before insert or update on public.workspace_evidence for each row execute function public.guard_workspace_evidence_verification();

drop policy if exists workspace_evidence_read on public.workspace_evidence;
create policy workspace_evidence_read on public.workspace_evidence for select to authenticated using(public.workspace_project_access(project_id));
drop policy if exists workspace_evidence_insert on public.workspace_evidence;
create policy workspace_evidence_insert on public.workspace_evidence for insert to authenticated with check(author_id = auth.uid() and public.workspace_project_access(project_id));
drop policy if exists workspace_evidence_update on public.workspace_evidence;
create policy workspace_evidence_update on public.workspace_evidence for update to authenticated using(public.workspace_evidence_reviewer(project_id)) with check(public.workspace_evidence_reviewer(project_id));
drop policy if exists workspace_evidence_delete on public.workspace_evidence;
create policy workspace_evidence_delete on public.workspace_evidence for delete to authenticated using(public.workspace_project_access(project_id) and not verified and (author_id = auth.uid() or public.workspace_project_owner(project_id)));
drop policy if exists workspace_comments_read on public.workspace_comments;
create policy workspace_comments_read on public.workspace_comments for select to authenticated using(public.workspace_project_access(project_id));
drop policy if exists workspace_comments_insert on public.workspace_comments;
create policy workspace_comments_insert on public.workspace_comments for insert to authenticated with check(author_id = auth.uid() and public.workspace_project_access(project_id));
drop policy if exists workspace_comments_delete on public.workspace_comments;
create policy workspace_comments_delete on public.workspace_comments for delete to authenticated using(public.workspace_project_access(project_id) and (author_id = auth.uid() or public.workspace_project_owner(project_id)));
drop policy if exists workspace_notifications_read on public.workspace_notifications;
create policy workspace_notifications_read on public.workspace_notifications for select to authenticated using(user_id = auth.uid() and public.workspace_project_access(project_id));

create or replace function public.workspace_mark_notification_read(p_notification_id uuid, p_read boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.workspace_notifications set read_at = case when p_read then coalesce(read_at, now()) else null end
  where id = p_notification_id and user_id = auth.uid() and public.workspace_project_access(project_id);
  if not found then raise exception using errcode='42501', message='Notification no longer available'; end if;
  return jsonb_build_object('saved',true);
end;
$$;
revoke all on function public.workspace_mark_notification_read(uuid,boolean) from public, anon;
grant execute on function public.workspace_mark_notification_read(uuid,boolean) to authenticated;

create or replace function public.notify_workspace_milestone_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare previous_status text;
begin
  previous_status := case when tg_op = 'UPDATE' then old.status else null end;
  if new.status is not distinct from previous_status or new.status not in ('SUBMITTED','APPROVED','REVISION_REQUESTED') then return new; end if;
  insert into public.workspace_notifications(user_id,project_id,milestone_id,kind,title,body)
  select person.id, new.squad_id, new.id::text,
    case new.status when 'SUBMITTED' then 'milestone.submitted' when 'APPROVED' then 'milestone.approved' else 'milestone.revision' end,
    case new.status when 'SUBMITTED' then 'Delivery ready for review' when 'APPROVED' then 'Delivery approved' else 'Revision requested' end,
    left(p.title || ' · ' || new.name,1000)
  from public.pms_squads p cross join lateral public.workspace_signal_people(p.id) person
    join auth.users u on u.id = person.id
  where p.id = new.squad_id and (new.status <> 'SUBMITTED' or p.mentor_id = u.id::text or lower(p.mentor_id) = lower(u.email));
  return new;
end;
$$;
revoke all on function public.notify_workspace_milestone_change() from public, anon, authenticated;
drop trigger if exists workspace_notify_milestone_change on public.milestones;
create trigger workspace_notify_milestone_change after insert or update of status on public.milestones for each row execute function public.notify_workspace_milestone_change();

create or replace function public.notify_workspace_comment_mentions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_notifications(user_id,project_id,milestone_id,kind,title,body)
  select p.id, new.project_id, new.milestone_id, 'comment.mention', 'You were mentioned in a project comment', left(new.body,180)
  from public.workspace_signal_people(new.project_id) p where p.id = any(new.mentions) and p.id <> new.author_id;
  return new;
end;
$$;
revoke all on function public.notify_workspace_comment_mentions() from public, anon, authenticated;
drop trigger if exists workspace_notify_comment_mentions on public.workspace_comments;
create trigger workspace_notify_comment_mentions after insert on public.workspace_comments for each row execute function public.notify_workspace_comment_mentions();

-- Keep unlinked project evidence when a milestone is deleted. IDs cannot be
-- forged into a different project's timeline, including through direct REST.
create or replace function public.workspace_unlink_deleted_milestone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.workspace_evidence set milestone_id = null where milestone_id = old.id::text;
  update public.workspace_comments set milestone_id = null where milestone_id = old.id::text;
  delete from public.workspace_notifications where milestone_id = old.id::text;
  return old;
end;
$$;
revoke all on function public.workspace_unlink_deleted_milestone() from public, anon, authenticated;
drop trigger if exists workspace_unlink_deleted_milestone on public.milestones;
create trigger workspace_unlink_deleted_milestone after delete on public.milestones for each row execute function public.workspace_unlink_deleted_milestone();

-- Aggregate through RLS, so portfolio counts cannot include inaccessible work.
create or replace function public.workspace_evidence_summary()
returns table(project_id text, recorded bigint, verified bigint)
language sql stable security invoker set search_path = '' as $$
  select e.project_id, count(*), count(*) filter(where e.verified)
  from public.workspace_evidence e group by e.project_id;
$$;
revoke all on function public.workspace_evidence_summary() from public, anon;
grant execute on function public.workspace_evidence_summary() to authenticated;

-- Optional scheduled maintenance; no authenticated caller can purge inboxes.
create or replace function public.workspace_cleanup_notifications()
returns bigint language plpgsql security definer set search_path = '' as $$
declare affected bigint;
begin
  delete from public.workspace_notifications where created_at < now() - interval '180 days';
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.workspace_cleanup_notifications() from public, anon, authenticated;
grant execute on function public.workspace_cleanup_notifications() to service_role;

commit;
