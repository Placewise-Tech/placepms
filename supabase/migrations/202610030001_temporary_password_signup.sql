begin;

-- A shared, atomic signup limiter for all serverless instances. Only the server
-- role can call it. Identifiers are HMAC hashes, never email addresses or IPs.
create table if not exists public.signup_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.signup_rate_limits enable row level security;
revoke all on public.signup_rate_limits from public, anon, authenticated;

create or replace function public.claim_signup_attempt(p_ip_hash text, p_email_hash text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  ip_attempts integer;
  email_attempts integer;
begin
  if p_ip_hash !~ '^[a-f0-9]{64}$' or p_email_hash !~ '^[a-f0-9]{64}$'
     or p_ip_hash is null or p_email_hash is null then
    return false;
  end if;
  delete from public.signup_rate_limits where window_start < now() - interval '2 hours';
  insert into public.signup_rate_limits as limits (key, window_start, attempts)
    values ('ip:' || p_ip_hash, now(), 1)
    on conflict (key) do update set
      attempts = case when limits.window_start <= now() - interval '1 hour' then 1 else limits.attempts + 1 end,
      window_start = case when limits.window_start <= now() - interval '1 hour' then now() else limits.window_start end
    returning attempts into ip_attempts;
  insert into public.signup_rate_limits as limits (key, window_start, attempts)
    values ('email:' || p_email_hash, now(), 1)
    on conflict (key) do update set
      attempts = case when limits.window_start <= now() - interval '1 hour' then 1 else limits.attempts + 1 end,
      window_start = case when limits.window_start <= now() - interval '1 hour' then now() else limits.window_start end
    returning attempts into email_attempts;
  return ip_attempts <= 10 and email_attempts <= 3;
end;
$$;
revoke all on function public.claim_signup_attempt(text, text) from public, anon, authenticated;
grant execute on function public.claim_signup_attempt(text, text) to service_role;

-- Only a real password update clears the server-owned first-login requirement.
-- This also handles a forgotten temporary password via Supabase recovery.
create or replace function public.finish_initial_password_setup()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.raw_app_meta_data ->> 'must_change_password' = 'true'
     and new.encrypted_password is distinct from old.encrypted_password
     and coalesce(new.encrypted_password, '') <> '' then
    new.raw_app_meta_data := jsonb_set(
      coalesce(new.raw_app_meta_data, '{}'::jsonb), '{must_change_password}', 'false'::jsonb
    );
  end if;
  return new;
end;
$$;
revoke all on function public.finish_initial_password_setup() from public, anon, authenticated;
drop trigger if exists placepms_finish_initial_password on auth.users;
create trigger placepms_finish_initial_password
before update of encrypted_password on auth.users
for each row execute function public.finish_initial_password_setup();

-- Read live, server-owned metadata rather than a stale JWT or user_metadata.
create or replace function public.has_completed_password_setup()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users
    where id = (select auth.uid())
      and coalesce(raw_app_meta_data ->> 'must_change_password', 'false') <> 'true'
  );
$$;
revoke all on function public.has_completed_password_setup() from public, anon;
grant execute on function public.has_completed_password_setup() to authenticated;

-- Restrictive policies AND with the existing ownership policies; they do not
-- grant additional access. A direct database request cannot bypass the UI gate.
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles', 'pms_squads', 'squad_members', 'milestones', 'connected_integrations', 'user_sessions'] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists require_password_setup on public.%I', table_name);
      execute format(
        'create policy require_password_setup on public.%I as restrictive for all to authenticated using ((select public.has_completed_password_setup())) with check ((select public.has_completed_password_setup()))',
        table_name
      );
    end if;
  end loop;
end;
$$;

commit;
