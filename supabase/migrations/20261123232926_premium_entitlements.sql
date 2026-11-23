-- HAN-132: Free and Premium plans (monetization plan approved on HAN-127, free cap from HAN-129).
--   entitlements : who has Premium, and until when. Written only by the entitlements function (RevenueCat) or by hand
--                  in the SQL editor (source 'manual', e.g. the board's beta accounts). Users can read their own row.
--   stash_usage  : one row per AI stash that reached "done" with something filed. The monthly cap counts these, so
--                  deleting a stash doesn't hand the allowance back, and lists added from a friend's share don't count.
--   plan_limits  : the numbers, in one row, so they can change in the SQL editor without a migration or an app release.
-- Enforced server-side: process-link calls claim_stash_allowance before any paid call, and a trigger caps list_shares.

create table public.plan_limits (
  id boolean primary key default true check (id),
  -- HAN-129: 15 a month keeps the average free user near $0.84/month of AI and lookup spend.
  free_monthly_stashes integer not null default 15 check (free_monthly_stashes >= 0),
  -- Premium is "unlimited" with a fair-use ceiling; the 20/hour and $3/day limits (HAN-37) still apply on top.
  premium_monthly_stashes integer not null default 300 check (premium_monthly_stashes >= 0),
  -- Sharing stays free with a light limit: lists shared at the same time.
  free_shared_lists integer not null default 5 check (free_shared_lists >= 0),
  premium_shared_lists integer not null default 100 check (premium_shared_lists >= 0)
);
insert into public.plan_limits default values;
alter table public.plan_limits enable row level security;
revoke all on public.plan_limits from anon, authenticated;

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null check (plan in ('free', 'premium')),
  source text not null check (source in ('revenuecat', 'manual')),
  -- RevenueCat's product id and store, for support; null for manual grants.
  product_id text check (length(product_id) <= 200),
  store text check (length(store) <= 40),
  -- Null means no end date (manual grants). Premium counts only while expires_at is in the future.
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.entitlements enable row level security;
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;
create policy "read own entitlement" on public.entitlements
  for select to authenticated using (user_id = (select auth.uid()));

create table public.stash_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Kept (as null) when the stash is deleted, so the month's count doesn't drop.
  link_id uuid unique references public.links (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stash_usage_user_created_idx on public.stash_usage (user_id, created_at);
alter table public.stash_usage enable row level security;
revoke all on public.stash_usage from anon, authenticated;

create function public.is_premium(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.entitlements
    where user_id = p_user and plan = 'premium' and (expires_at is null or expires_at > now())
  );
$$;
revoke execute on function public.is_premium(uuid) from public, anon, authenticated;
grant execute on function public.is_premium(uuid) to service_role;

-- The cap resets on the 1st of each month, UTC.
create function public.stash_month_start() returns timestamptz
language sql stable set search_path = '' as $$ select date_trunc('month', now(), 'UTC') $$;

-- Stashes counted against this month: finished ones, plus the user's other runs still in flight, so a burst of links
-- sent together can't all pass at 14 of 15.
create function public.stashes_used(p_user uuid, p_except uuid default null) returns integer
language sql stable security definer set search_path = '' as $$
  select (
    (select count(*) from public.stash_usage where user_id = p_user and created_at >= public.stash_month_start())
    + (select count(*) from public.links where user_id = p_user and status = 'processing'
         and id is distinct from p_except and not exists (select 1 from public.stash_usage u where u.link_id = links.id))
  )::integer;
$$;
revoke execute on function public.stashes_used(uuid, uuid) from public, anon, authenticated;

-- Called by process-link (service role) after it claims a link and before any paid call. Serialised per user.
create function public.claim_stash_allowance(p_user uuid, p_link uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  premium boolean := public.is_premium(p_user);
  lim integer;
  used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('stash_allowance:' || p_user::text, 0));
  select case when premium then premium_monthly_stashes else free_monthly_stashes end into lim from public.plan_limits;
  used := public.stashes_used(p_user, p_link);
  return jsonb_build_object('allowed', used < lim, 'reason', case when used >= lim then 'monthly_limit' end,
    'plan', case when premium then 'premium' else 'free' end, 'used', used, 'limit', lim);
end $$;
revoke execute on function public.claim_stash_allowance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_stash_allowance(uuid, uuid) to service_role;

-- What the app shows on the paywall and Profile. Read-only, for the caller only.
create function public.my_plan() returns jsonb
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
    -- Premium's "custom organization" (HAN-127) has no gated feature yet; the app reads this flag when one lands.
    'custom_organization', premium
  );
end $$;
revoke execute on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- Sharing stays free, with a light limit on how many lists are shared at once. Shares made before this stay.
create function public.list_shares_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lim integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('list_shares_limit:' || new.user_id::text, 0));
  -- Already shared: let the unique constraint answer, so shareList() falls back to the existing token.
  if exists (select 1 from public.list_shares where list_id = new.list_id) then
    return new;
  end if;
  select case when public.is_premium(new.user_id) then premium_shared_lists else free_shared_lists end
    into lim from public.plan_limits;
  if (select count(*) from public.list_shares where user_id = new.user_id) >= lim then
    raise exception 'You can share up to % lists at a time. Stop sharing one to share this list.', lim
      using errcode = '54000', hint = 'shared_list_limit';
  end if;
  return new;
end $$;
revoke execute on function public.list_shares_limit() from public, anon, authenticated;
create trigger list_shares_limit before insert on public.list_shares
  for each row execute function public.list_shares_limit();
