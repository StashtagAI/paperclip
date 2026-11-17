-- HAN-54: rls_auto_enable() is the security definer function behind the ensure_rls event trigger. Event triggers
-- don't need EXECUTE to fire, so nobody but the owner needs it; leaving it granted exposed it at /rest/v1/rpc.
-- Supabase creates it on hosted projects only, hence the guard for local and CI databases.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
