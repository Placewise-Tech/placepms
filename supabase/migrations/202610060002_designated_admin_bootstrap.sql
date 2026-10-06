begin;

-- The designated installation owner may be promoted on the first authenticated
-- workspace request. Keep that first request usable: the role is authoritative
-- immediately through workspace_accounts, while later sign-ins receive the
-- synced app metadata. Normal role changes still revoke existing sessions.
create or replace function public.workspace_sync_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare first_admin boolean;
begin
  -- Only a server-side first-admin grant preserves the current session. Do not
  -- rely on a client-settable configuration flag to bypass session revocation.
  first_admin = new.role='admin' and new.enabled
    and (tg_op='INSERT' or old.role<>'admin')
    and coalesce(auth.role(),'') <> 'authenticated'
    and not exists(select 1 from public.workspace_accounts where role='admin' and user_id<>new.user_id);
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('workspace_role',new.role,'workspace_enabled',new.enabled,'workspace_can_mentor',new.can_mentor)
    where id=new.user_id;
  if (tg_op='INSERT' and (new.role<>'student' or not new.enabled) or tg_op='UPDATE' and (new.role is distinct from old.role or new.enabled is distinct from old.enabled or new.can_mentor is distinct from old.can_mentor))
    and not first_admin then
    delete from auth.sessions where user_id=new.user_id;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
