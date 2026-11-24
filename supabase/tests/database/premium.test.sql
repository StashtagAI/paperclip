-- HAN-132: entitlements, the monthly stash allowance, my_plan and the shared-list limit. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

create schema tests;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function tests.anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;
grant usage on schema tests to authenticated, anon;

-- A is free, B is Premium (RevenueCat), C's Premium expired.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.com'),
  ('00000000-0000-4000-8000-00000000000c', 'c@example.com');
insert into public.entitlements (user_id, plan, source, expires_at) values
  ('00000000-0000-4000-8000-00000000000b', 'premium', 'revenuecat', now() + interval '1 year'),
  ('00000000-0000-4000-8000-00000000000c', 'premium', 'revenuecat', now() - interval '1 minute');
update public.plan_limits set free_monthly_stashes = 3, premium_monthly_stashes = 5, free_shared_lists = 2, premium_shared_lists = 3;

select ok(public.is_premium('00000000-0000-4000-8000-00000000000b'), 'B is Premium');
select ok(not public.is_premium('00000000-0000-4000-8000-00000000000a'), 'no row: free');
select ok(not public.is_premium('00000000-0000-4000-8000-00000000000c'), 'expired: free');

-- ---------- clients can't grant themselves Premium or touch the ledger ----------
select tests.login('00000000-0000-4000-8000-00000000000a');
select throws_ok($$insert into public.entitlements (user_id, plan, source) values ('00000000-0000-4000-8000-00000000000a', 'premium', 'manual')$$,
  '42501', null, 'entitlements: no client inserts');
select throws_ok($$update public.entitlements set expires_at = null$$, '42501', null, 'entitlements: no client updates');
select throws_ok($$delete from public.entitlements$$, '42501', null, 'entitlements: no client deletes');
select is((select count(*)::int from public.entitlements), 0, 'entitlements: A sees no one else''s row');
select throws_ok($$select * from public.stash_usage$$, '42501', null, 'stash_usage: server-only');
select throws_ok($$insert into public.stash_usage (user_id) values ('00000000-0000-4000-8000-00000000000a')$$, '42501', null, 'stash_usage: no client inserts');
select throws_ok($$update public.plan_limits set free_monthly_stashes = 1000$$, '42501', null, 'plan_limits: no client writes');
select throws_ok($$select public.claim_stash_allowance('00000000-0000-4000-8000-00000000000a', null)$$, '42501', null, 'claim_stash_allowance: service role only');
select throws_ok($$select public.is_premium('00000000-0000-4000-8000-00000000000b')$$, '42501', null, 'is_premium: service role only');
select tests.login('00000000-0000-4000-8000-00000000000b');
select is((select plan from public.entitlements), 'premium', 'B reads own entitlement');
select tests.anon();
select throws_ok($$select public.my_plan()$$, '42501', null, 'my_plan: not for anon');
select throws_ok($$select * from public.entitlements$$, '42501', null, 'entitlements: nothing for anon');
reset role;

-- ---------- the monthly allowance ----------
-- A: two stashes this month (one since deleted), one last month, one in flight, and the link being claimed.
insert into public.links (id, user_id, url, platform, status) values
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A1/', 'instagram', 'done'),
  ('00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A2/', 'instagram', 'done'),
  ('00000000-0000-4000-8000-0000000001a4', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A4/', 'instagram', 'processing'),
  ('00000000-0000-4000-8000-0000000001a5', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A5/', 'instagram', 'processing'),
  -- A list added from a friend's share makes a done link but no usage row.
  ('00000000-0000-4000-8000-0000000001a6', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A6/', 'instagram', 'done');
insert into public.stash_usage (user_id, link_id, created_at) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000001a1', now()),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000001a2', now()),
  ('00000000-0000-4000-8000-00000000000a', null, public.stash_month_start() - interval '1 second');
delete from public.links where id = '00000000-0000-4000-8000-0000000001a2';
select is((select count(*)::int from public.stash_usage where user_id = '00000000-0000-4000-8000-00000000000a' and created_at >= public.stash_month_start()), 2,
  'deleting a stash keeps its usage row');

select is(public.claim_stash_allowance('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000001a5'),
  '{"allowed": false, "reason": "monthly_limit", "plan": "free", "used": 3, "limit": 3,
    "video_seconds": 90, "premium_video_seconds": 150}'::jsonb,
  'free: 2 done this month + 1 other in flight = 3 of 3, refused');
delete from public.links where id = '00000000-0000-4000-8000-0000000001a4';
select is(public.claim_stash_allowance('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000001a5') ->> 'allowed', 'true',
  'free: 2 of 3 (last month and shared-list links don''t count), allowed');

-- B (Premium) with 4 used gets the fair-use ceiling of 5; C (expired) is back on the free 3.
insert into public.stash_usage (user_id) select '00000000-0000-4000-8000-00000000000b'::uuid from generate_series(1, 4);
insert into public.stash_usage (user_id) select '00000000-0000-4000-8000-00000000000c'::uuid from generate_series(1, 4);
select is(public.claim_stash_allowance('00000000-0000-4000-8000-00000000000b', null),
  '{"allowed": true, "reason": null, "plan": "premium", "used": 4, "limit": 5,
    "video_seconds": 150, "premium_video_seconds": 150}'::jsonb, 'premium: fair-use ceiling, and 2:30 videos (HAN-126)');
select is(public.claim_stash_allowance('00000000-0000-4000-8000-00000000000c', null) ->> 'reason', 'monthly_limit', 'expired premium: free cap');
insert into public.stash_usage (user_id) values ('00000000-0000-4000-8000-00000000000b');
select is(public.claim_stash_allowance('00000000-0000-4000-8000-00000000000b', null) ->> 'reason', 'monthly_limit', 'premium: refused past the ceiling');

-- ---------- my_plan ----------
select tests.login('00000000-0000-4000-8000-00000000000a');
select is(public.my_plan() - 'resets_at',
  '{"plan": "free", "source": null, "expires_at": null, "stashes_used": 3, "stash_limit": 3, "free_stash_limit": 3,
    "shared_lists": 0, "shared_list_limit": 2, "free_shared_list_limit": 2,
    "video_seconds": 90, "free_video_seconds": 90, "premium_video_seconds": 150, "custom_organization": false}'::jsonb,
  'my_plan: free, counting the in-flight run');
select is((public.my_plan() ->> 'resets_at')::timestamptz, date_trunc('month', now(), 'UTC') + interval '1 month', 'my_plan: resets on the 1st, UTC');
select tests.login('00000000-0000-4000-8000-00000000000b');
select is(public.my_plan() ->> 'plan', 'premium', 'my_plan: premium');
select is((public.my_plan() ->> 'custom_organization')::boolean, true, 'my_plan: premium unlocks custom organization');
select is((public.my_plan() ->> 'video_seconds')::int, 150, 'my_plan: premium reads videos up to 2:30');
reset role;

-- ---------- shared-list limit ----------
insert into public.categories (id, user_id, kind, name) values
  ('00000000-0000-4000-8000-0000000002a0', '00000000-0000-4000-8000-00000000000a', 'eats', 'Cafes'),
  ('00000000-0000-4000-8000-0000000002b0', '00000000-0000-4000-8000-00000000000b', 'eats', 'Cafes');
insert into public.lists (id, user_id, category_id, name)
  select ('00000000-0000-4000-8000-0000000003a' || n)::uuid, '00000000-0000-4000-8000-00000000000a'::uuid, '00000000-0000-4000-8000-0000000002a0'::uuid, 'A' || n from generate_series(1, 3) n
  union all
  select ('00000000-0000-4000-8000-0000000003b' || n)::uuid, '00000000-0000-4000-8000-00000000000b'::uuid, '00000000-0000-4000-8000-0000000002b0'::uuid, 'B' || n from generate_series(1, 3) n;

select tests.login('00000000-0000-4000-8000-00000000000a');
insert into public.list_shares (list_id) values ('00000000-0000-4000-8000-0000000003a1'), ('00000000-0000-4000-8000-0000000003a2');
select throws_ok($$insert into public.list_shares (list_id) values ('00000000-0000-4000-8000-0000000003a3')$$,
  '54000', 'You can share up to 2 lists at a time. Stop sharing one to share this list.', 'free: third shared list refused');
select throws_ok($$insert into public.list_shares (list_id) values ('00000000-0000-4000-8000-0000000003a1')$$,
  '23505', null, 'sharing an already-shared list still hits the unique constraint (shareList reuses the token)');
delete from public.list_shares where list_id = '00000000-0000-4000-8000-0000000003a2';
select lives_ok($$insert into public.list_shares (list_id) values ('00000000-0000-4000-8000-0000000003a3')$$, 'free: stop sharing one, share another');

select tests.login('00000000-0000-4000-8000-00000000000b');
select lives_ok($$insert into public.list_shares (list_id) values ('00000000-0000-4000-8000-0000000003b1'), ('00000000-0000-4000-8000-0000000003b2'), ('00000000-0000-4000-8000-0000000003b3')$$,
  'premium: higher shared-list limit');
reset role;

-- Deleting an account removes its entitlement and usage.
delete from auth.users where id = '00000000-0000-4000-8000-00000000000b';
select is((select count(*)::int from public.entitlements where user_id = '00000000-0000-4000-8000-00000000000b'), 0, 'account deletion: entitlement gone');
select is((select count(*)::int from public.stash_usage where user_id = '00000000-0000-4000-8000-00000000000b'), 0, 'account deletion: usage gone');

select * from finish();
rollback;
