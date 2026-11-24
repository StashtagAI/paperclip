-- HAN-126: how long a video process-link will read (transcript, then the video model), by plan. Free keeps HAN-88's
-- 90 s; Premium reads up to 2:30 (the board's call: a 1:55 reel was refused as too long). In plan_limits so the numbers
-- change in the SQL editor without a release. Spend stays bounded by the $0.10 per-video cap and the 25 MB download cap.
alter table public.plan_limits
  add column free_video_seconds integer not null default 90 check (free_video_seconds between 0 and 600),
  add column premium_video_seconds integer not null default 150 check (premium_video_seconds between 0 and 600);

create or replace function public.claim_stash_allowance(p_user uuid, p_link uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  premium boolean := public.is_premium(p_user);
  l public.plan_limits;
  lim integer;
  used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('stash_allowance:' || p_user::text, 0));
  select * into l from public.plan_limits;
  lim := case when premium then l.premium_monthly_stashes else l.free_monthly_stashes end;
  used := public.stashes_used(p_user, p_link);
  return jsonb_build_object('allowed', used < lim, 'reason', case when used >= lim then 'monthly_limit' end,
    'plan', case when premium then 'premium' else 'free' end, 'used', used, 'limit', lim,
    'video_seconds', case when premium then l.premium_video_seconds else l.free_video_seconds end,
    'premium_video_seconds', l.premium_video_seconds);
end $$;

create or replace function public.my_plan() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  premium boolean;
  e public.entitlements;
  l public.plan_limits;
begin
  if uid is null then
    raise exception 'sign in to see your plan' using errcode = '42501';
  end if;
  premium := public.is_premium(uid);
  select * into e from public.entitlements where user_id = uid;
  select * into l from public.plan_limits;
  return jsonb_build_object(
    'plan', case when premium then 'premium' else 'free' end,
    'source', case when premium then e.source end,
    'expires_at', case when premium then e.expires_at end,
    'stashes_used', public.stashes_used(uid),
    'stash_limit', case when premium then l.premium_monthly_stashes else l.free_monthly_stashes end,
    'free_stash_limit', l.free_monthly_stashes,
    'resets_at', public.stash_month_start() + interval '1 month',
    'shared_lists', (select count(*) from public.list_shares where user_id = uid),
    'shared_list_limit', case when premium then l.premium_shared_lists else l.free_shared_lists end,
    'free_shared_list_limit', l.free_shared_lists,
    'video_seconds', case when premium then l.premium_video_seconds else l.free_video_seconds end,
    'free_video_seconds', l.free_video_seconds,
    'premium_video_seconds', l.premium_video_seconds,
    -- Premium's "custom organization" (HAN-127) has no gated feature yet; the app reads this flag when one lands.
    'custom_organization', premium
  );
end $$;
