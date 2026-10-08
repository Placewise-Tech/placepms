begin;

-- Keep an account identity on members that join through the registered-user
-- invitation flow. Existing email-only members remain valid and continue to
-- be matched by email for backwards compatibility.
alter table public.squad_members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

update public.squad_members m
set user_id = u.id
from auth.users u
where m.user_id is null
  and lower(m.email) = lower(u.email);

create index if not exists squad_members_user_id on public.squad_members(user_id);

create table if not exists public.project_member_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.pms_squads(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (project_id, invitee_id),
  check (inviter_id <> invitee_id)
);
alter table public.project_member_invitations enable row level security;
revoke all on public.project_member_invitations from public, anon, authenticated;
grant all on public.project_member_invitations to service_role;
create index if not exists project_member_invitations_invitee_status
  on public.project_member_invitations(invitee_id, status, created_at desc);

-- Only explicit invitation RPCs can add a member. Existing leads retain role,
-- skills and removal management; changing an identity requires a new invite.
alter table public.squad_members enable row level security;
-- The invitation function is security-definer; the restrictive policy keeps
-- the same privilege from becoming a direct browser insertion path.
grant insert on public.squad_members to authenticated;
drop policy if exists workspace_member_invitation_insert on public.squad_members;
create policy workspace_member_invitation_insert on public.squad_members as restrictive
for insert to authenticated with check (false);
create or replace function public.guard_workspace_member_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and (
    new.user_id is distinct from old.user_id
    or new.email is distinct from old.email
    or new.squad_id is distinct from old.squad_id
  ) then
    raise exception using errcode = '42501', message = 'Invite a new user to change the team member identity';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_workspace_member_identity() from public, anon, authenticated;
drop trigger if exists workspace_guard_member_identity on public.squad_members;
create trigger workspace_guard_member_identity before update on public.squad_members
for each row execute function public.guard_workspace_member_identity();

-- Return a small registered-user directory only to an active project owner.
-- Emails and identities come from Auth, not user-editable profile fields.
create or replace function public.workspace_project_directory(p_project_id text, p_search text default '', p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.workspace_project_owner(p_project_id) then
    raise exception using errcode = '42501', message = 'Only the project lead can invite teammates';
  end if;
  if p_page < 1 or p_page > 100000 or length(p_search) > 100 then
    raise exception using errcode = '22023', message = 'Invalid registered-user search';
  end if;
  with matching as (
    select u.id, lower(u.email) as email, coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)) as full_name
    from auth.users u join public.profiles p on p.id = u.id
      left join public.workspace_accounts a on a.user_id = u.id
    where u.id <> auth.uid() and u.email is not null and coalesce(a.enabled, true)
      and not exists (select 1 from public.pms_squads s where s.id = p_project_id and lower(s.leader_email) = lower(u.email))
      and not exists (select 1 from public.squad_members m where m.squad_id = p_project_id and (m.user_id = u.id or lower(m.email) = lower(u.email)))
      and not exists (select 1 from public.project_member_invitations i where i.project_id = p_project_id and i.invitee_id = u.id and i.status = 'pending')
      and (p_search = '' or position(lower(trim(p_search)) in lower(coalesce(p.full_name, '') || ' ' || u.email)) > 0)
  ), page as (select * from matching order by full_name, id limit 20 offset (p_page - 1) * 20)
  select jsonb_build_object('people', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb), 'total', (select count(*) from matching)) into result;
  return result;
end;
$$;

create or replace function public.workspace_send_project_invitation(p_project_id text, p_invitee_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare project public.pms_squads%rowtype; target record; invitation_id uuid;
begin
  if not public.workspace_project_owner(p_project_id) then
    raise exception using errcode = '42501', message = 'Only the project lead can invite teammates';
  end if;
  -- Serializes concurrent invites/acceptances for a project, including retries.
  select * into project from public.pms_squads where id = p_project_id for update;
  if not found or project.status in ('ARCHIVED', 'CANCELLED', 'CANCELED', 'REJECTED') then
    raise exception 'This project is no longer accepting teammates';
  end if;
  select u.id, u.email into target from auth.users u join public.profiles p on p.id = u.id
    left join public.workspace_accounts a on a.user_id = u.id
    where u.id = p_invitee_id and u.email is not null and coalesce(a.enabled, true);
  if not found then
    raise exception using errcode = '22023', message = 'Choose an enabled registered PlacePMS user';
  end if;
  if target.id = auth.uid() or lower(target.email) = lower(project.leader_email) then
    raise exception using errcode = '22023', message = 'That user already leads this project';
  end if;
  if exists (select 1 from public.squad_members m where m.squad_id = p_project_id and (m.user_id = target.id or lower(m.email) = lower(target.email))) then
    raise exception 'That user is already on the project team';
  end if;
  insert into public.project_member_invitations as i (project_id, inviter_id, invitee_id)
  values (p_project_id, auth.uid(), target.id)
  on conflict (project_id, invitee_id) do update
    set inviter_id = auth.uid(), status = 'pending', created_at = now(), responded_at = null
    where i.status <> 'pending'
  returning id into invitation_id;
  if invitation_id is null then raise exception 'That user already has a pending invitation'; end if;
  return jsonb_build_object('saved', true, 'invitationId', invitation_id);
end;
$$;

create or replace function public.workspace_list_project_invitations()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_completed_password_setup() then
    raise exception using errcode = '42501', message = 'Sign in again';
  end if;
  return jsonb_build_object('invitations', coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'projectId', s.id, 'projectTitle', s.title,
      'inviterName', coalesce(nullif(p.full_name, ''), u.email, 'Project lead'), 'inviterEmail', u.email,
      'createdAt', i.created_at) order by i.created_at desc)
    from public.project_member_invitations i join public.pms_squads s on s.id = i.project_id
      join auth.users u on u.id = i.inviter_id left join public.profiles p on p.id = u.id
    where i.invitee_id = auth.uid() and i.status = 'pending'
  ), '[]'::jsonb));
end;
$$;

create or replace function public.workspace_reject_project_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_completed_password_setup() then
    raise exception using errcode = '42501', message = 'Sign in again';
  end if;
  update public.project_member_invitations set status = 'rejected', responded_at = now()
  where id = p_invitation_id and invitee_id = auth.uid() and status = 'pending';
  if not found then raise exception 'This invitation is no longer available'; end if;
  return jsonb_build_object('saved', true);
end;
$$;

-- Acceptance creates membership and changes invitation status in one
-- transaction, even if a client retries or responds from multiple devices.
create or replace function public.workspace_accept_project_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.project_member_invitations%rowtype;
  profile_row record;
begin
  if not public.has_completed_password_setup() then
    raise exception using errcode = '42501', message = 'Sign in again';
  end if;

  -- Lock in the same order as send: project, then invitation.
  perform 1 from public.pms_squads s join public.project_member_invitations i on i.project_id = s.id
  where i.id = p_invitation_id and i.invitee_id = auth.uid() for update of s;
  select * into invitation
  from public.project_member_invitations
  where id = p_invitation_id
    and invitee_id = auth.uid()
  for update;

  if not found or invitation.status <> 'pending' then
    raise exception 'This invitation is no longer available';
  end if;
  if exists (select 1 from public.pms_squads where id = invitation.project_id and status in ('ARCHIVED', 'CANCELLED', 'CANCELED', 'REJECTED')) then
    raise exception 'This project is no longer accepting teammates';
  end if;

  select u.id, u.email, p.full_name into profile_row
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = auth.uid();
  if profile_row.email is null then
    raise exception 'Your registered profile is missing an email address';
  end if;

  if not exists (select 1 from public.pms_squads where id = invitation.project_id and lower(leader_email) = lower(profile_row.email))
    and not exists (select 1 from public.squad_members where squad_id = invitation.project_id and (user_id = auth.uid() or lower(email) = lower(profile_row.email))) then
    insert into public.squad_members (squad_id, user_id, name, email, role, skills)
    values (
      invitation.project_id,
      auth.uid(),
      coalesce(nullif(profile_row.full_name, ''), split_part(profile_row.email, '@', 1)),
      lower(profile_row.email),
      'Member',
      '{}'
    );
  end if;

  update public.project_member_invitations
  set status = 'accepted', responded_at = now()
  where id = invitation.id;

  return jsonb_build_object('saved', true, 'projectId', invitation.project_id);
end;
$$;
revoke all on function public.workspace_project_directory(text, text, integer), public.workspace_send_project_invitation(text, uuid),
  public.workspace_list_project_invitations(), public.workspace_reject_project_invitation(uuid), public.workspace_accept_project_invitation(uuid) from public, anon;
grant execute on function public.workspace_project_directory(text, text, integer), public.workspace_send_project_invitation(text, uuid),
  public.workspace_list_project_invitations(), public.workspace_reject_project_invitation(uuid), public.workspace_accept_project_invitation(uuid) to authenticated;

create or replace function public.workspace_project_access(p_project_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_completed_password_setup() and (public.workspace_is_admin() or exists(
    select 1 from public.pms_squads p where p.id = p_project_id and (
      lower(p.leader_email) = lower(auth.jwt() ->> 'email')
      or p.mentor_id = auth.uid()::text
      or lower(p.mentor_id) = lower(auth.jwt() ->> 'email')
      or exists (
        select 1 from public.squad_members m
        where m.squad_id = p.id
          and (m.user_id = auth.uid() or (m.user_id is null and lower(m.email) = lower(auth.jwt() ->> 'email')))
      )
    )
  ));
$$;
revoke all on function public.workspace_project_access(text) from public, anon;
grant execute on function public.workspace_project_access(text) to authenticated;

commit;
