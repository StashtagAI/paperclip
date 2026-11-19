-- HAN-100: launch waitlist for the landing page (stashtag.ai) until the apps are in the stores.
-- The `waitlist` edge function is the only write path: it validates the email, checks the honeypot and calls
-- waitlist_signup() with the service role. Clients get no grants at all, so the list can't be read, changed or
-- probed with the anon key, and nothing here depends on RLS alone.
create extension if not exists citext with schema extensions;

create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null unique
    check (length(email) <= 254 and email::text ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and email::text = lower(email::text)),
  platform text check (platform in ('ios', 'android')),
  -- Which form on the site ("hero", "cta", "try-again"), plus utm_* from the landing URL when JavaScript is on.
  source text check (length(source) <= 40),
  utm jsonb not null default '{}' check (jsonb_typeof(utm) = 'object' and length(utm::text) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.waitlist_signups enable row level security;
revoke all on public.waitlist_signups from anon, authenticated;

-- Per-IP rate limit. Only a keyed hash of the IP is stored (the function HMACs it), and rows older than a day are
-- deleted on every call, so this never becomes a log of who visited.
create table public.waitlist_attempts (
  ip_hash text not null check (length(ip_hash) <= 128),
  created_at timestamptz not null default now()
);
create index waitlist_attempts_ip_created_idx on public.waitlist_attempts (ip_hash, created_at desc);
create index waitlist_attempts_created_idx on public.waitlist_attempts (created_at);
alter table public.waitlist_attempts enable row level security;
revoke all on public.waitlist_attempts from anon, authenticated;

-- Returns 'ok' (new or already on the list: the caller can't tell which) or 'rate_limited'.
-- Generous for a person, tight for a script: 5 tries per IP in 10 minutes and 20 in 24 hours.
create function public.waitlist_signup(
  p_email text, p_platform text, p_source text, p_utm jsonb, p_ip_hash text
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  -- Serialise concurrent calls from one IP so parallel requests can't all pass the count.
  perform pg_advisory_xact_lock(hashtextextended('waitlist_signup:' || p_ip_hash, 0));
  delete from public.waitlist_attempts where created_at < now() - interval '24 hours';
  if (select count(*) from public.waitlist_attempts a
      where a.ip_hash = p_ip_hash and a.created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.waitlist_attempts a where a.ip_hash = p_ip_hash) >= 20 then
    return 'rate_limited';
  end if;
  insert into public.waitlist_attempts (ip_hash) values (p_ip_hash);
  -- A repeat signup keeps the first row as it was.
  insert into public.waitlist_signups (email, platform, source, utm)
  values (lower(trim(p_email)), p_platform, p_source, coalesce(p_utm, '{}'))
  on conflict (email) do nothing;
  return 'ok';
end $$;
revoke execute on function public.waitlist_signup(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.waitlist_signup(text, text, text, jsonb, text) to service_role;
