-- HAN-134: per-user rate limit on Send to Instacart. Each allowed call mints a page on Instacart under our partner key,
-- so a signed-in user can't spam them. Bookkeeping is in process_events (source 'function', which clients cannot
-- insert), stage 'instacart_quota', one row per attempt; detail.allowed says whether the page was made.

-- Called by shop-links (service role) before it calls Instacart. The limit comes from the function's secrets.
-- Serialised per user so a burst can't overshoot.
create function public.claim_instacart_quota(p_user uuid, p_per_hour integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hour_calls integer;
  allowed boolean;
begin
  perform pg_advisory_xact_lock(hashtext('instacart_quota:' || p_user::text));

  -- Only calls that went ahead count, so retrying while limited doesn't extend the wait.
  select count(*) into hour_calls from public.process_events
  where source = 'function' and stage = 'instacart_quota' and user_id = p_user
    and detail ->> 'allowed' = 'true' and created_at > now() - interval '1 hour';
  allowed := hour_calls < p_per_hour;

  insert into public.process_events (user_id, source, stage, ok, detail)
  values (p_user, 'function', 'instacart_quota', allowed,
    jsonb_build_object('allowed', allowed, 'hour_calls', hour_calls));

  return jsonb_build_object('allowed', allowed, 'hour_calls', hour_calls);
end $$;
revoke execute on function public.claim_instacart_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_instacart_quota(uuid, integer) to service_role;
