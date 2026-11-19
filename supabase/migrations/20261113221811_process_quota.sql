-- HAN-37: per-user rate limit and daily spend caps on process-link, with deduplicated alerts.
-- Bookkeeping lives in process_events (source 'function', which clients cannot insert):
--   stage 'quota' : one row per claim attempt; detail.allowed says whether the run went ahead
--   stage 'cost'  : one row per run, detail.usd = estimated spend (process-link/quota.ts)
--   stage 'alert' : a limit was hit or global spend passed 80% of the cap; detail.kind says which

create index process_events_quota_idx on public.process_events (stage, created_at) where source = 'function';

-- Called by process-link (service role) after it claims a link and before any paid call. Limits come from the
-- function's secrets so they can change without a migration. Serialised per user so a burst can't overshoot.
create function public.claim_process_quota(
  p_user uuid, p_link uuid, p_per_hour integer, p_user_daily_usd numeric, p_global_daily_usd numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  day_start timestamptz := date_trunc('day', now(), 'UTC');
  hour_runs integer;
  user_usd numeric;
  all_usd numeric;
  reason text;
  alert text;
begin
  perform pg_advisory_xact_lock(hashtext('process_quota:' || p_user::text));

  -- Only runs that went ahead count, so retrying while limited doesn't extend the wait.
  select count(*) into hour_runs from public.process_events
  where source = 'function' and stage = 'quota' and user_id = p_user
    and detail ->> 'allowed' = 'true' and created_at > now() - interval '1 hour';
  select coalesce(sum((detail ->> 'usd')::numeric), 0) into user_usd from public.process_events
  where source = 'function' and stage = 'cost' and user_id = p_user and created_at >= day_start;
  select coalesce(sum((detail ->> 'usd')::numeric), 0) into all_usd from public.process_events
  where source = 'function' and stage = 'cost' and created_at >= day_start;

  reason := case
    when hour_runs >= p_per_hour then 'rate_limited'
    when user_usd >= p_user_daily_usd or all_usd >= p_global_daily_usd then 'daily_limit'
  end;

  insert into public.process_events (link_id, user_id, source, stage, ok, detail)
  values (p_link, p_user, 'function', 'quota', reason is null, jsonb_build_object(
    'allowed', reason is null, 'reason', reason, 'hour_runs', hour_runs,
    'user_usd', round(user_usd, 4), 'all_usd', round(all_usd, 4)));

  -- One alert per user per limit per hour, and one 80%-of-global-cap warning per day.
  if reason is not null and not exists (
    select 1 from public.process_events where source = 'function' and stage = 'alert' and user_id = p_user
      and detail ->> 'kind' = reason and created_at > now() - interval '1 hour'
  ) then
    alert := reason;
  elsif reason is null and all_usd >= 0.8 * p_global_daily_usd and not exists (
    select 1 from public.process_events where source = 'function' and stage = 'alert'
      and detail ->> 'kind' = 'global_spend_80' and created_at >= day_start
  ) then
    alert := 'global_spend_80';
  end if;
  if alert is not null then
    insert into public.process_events (link_id, user_id, source, stage, ok, detail)
    values (p_link, p_user, 'function', 'alert', false, jsonb_build_object(
      'kind', alert, 'hour_runs', hour_runs, 'user_usd', round(user_usd, 4), 'all_usd', round(all_usd, 4),
      'limits', jsonb_build_object('per_hour', p_per_hour, 'user_daily_usd', p_user_daily_usd, 'global_daily_usd', p_global_daily_usd)));
  end if;

  return jsonb_build_object('allowed', reason is null, 'reason', reason, 'alert', alert,
    'hour_runs', hour_runs, 'user_usd', user_usd, 'all_usd', all_usd);
end $$;
revoke execute on function public.claim_process_quota(uuid, uuid, integer, numeric, numeric) from public, anon, authenticated;
grant execute on function public.claim_process_quota(uuid, uuid, integer, numeric, numeric) to service_role;
