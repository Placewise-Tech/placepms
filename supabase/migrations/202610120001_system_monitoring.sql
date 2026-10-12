begin;

-- Expose only aggregate PostgreSQL health values through an administrator-gated
-- function. The service role is not used by the browser for this request, so
-- workspace_is_admin() still evaluates the signed-in administrator's claims.
create or replace function public.workspace_system_metrics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare stats record; max_connections integer;
begin
  if not public.workspace_is_admin() then raise exception 'Administrator access required'; end if;
  select * into stats from pg_catalog.pg_stat_database where datname=current_database();
  max_connections = coalesce(nullif(current_setting('max_connections', true), ''), '0')::integer;
  return jsonb_build_object(
    'database', current_database(),
    'server_version', current_setting('server_version'),
    'active_connections', coalesce(stats.numbackends, 0),
    'max_connections', max_connections,
    'connection_utilization_percent', case when max_connections > 0 then round(coalesce(stats.numbackends, 0)::numeric / max_connections * 100, 2) else null end,
    'cache_hit_ratio_percent', case when coalesce(stats.blks_hit, 0) + coalesce(stats.blks_read, 0) > 0 then round(stats.blks_hit::numeric / (stats.blks_hit + stats.blks_read) * 100, 2) else null end,
    'transactions_committed', stats.xact_commit,
    'transactions_rolled_back', stats.xact_rollback,
    'blocks_read', stats.blks_read,
    'blocks_hit', stats.blks_hit,
    'stats_reset', stats.stats_reset
  );
end;
$$;
revoke all on function public.workspace_system_metrics() from public, anon;
grant execute on function public.workspace_system_metrics() to authenticated;

notify pgrst, 'reload schema';
commit;
