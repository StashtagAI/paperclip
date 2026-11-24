-- HAN-128: only accounts bound in admin_users can read admin_stats(). An allowlisted email on another account, a
-- changed email or an unconfirmed email gets nothing; admin_users itself is server-only. Everything rolls back.
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
grant usage on schema tests to authenticated, anon;

-- A = bound admin, B = ordinary user, C = signed up later with an allowlisted email that isn't bound to it,
-- D = bound but email not confirmed.
insert into auth.users (id, email, email_confirmed_at, created_at) values
  ('00000000-0000-4000-8000-00000000000a', 'Admin@Example.com', now(), now() - interval '40 days'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.com', now(), now() - interval '2 days'),
  ('00000000-0000-4000-8000-00000000000c', 'spare@example.com', now(), now()),
  ('00000000-0000-4000-8000-00000000000d', 'unconfirmed@example.com', null, now());
insert into public.admin_users (email, user_id) values
  ('admin@example.com', '00000000-0000-4000-8000-00000000000a'),
  ('spare@example.com', null),
  ('unconfirmed@example.com', '00000000-0000-4000-8000-00000000000d');

insert into public.links (user_id, url, platform, status, error, created_at) values
  ('00000000-0000-4000-8000-00000000000b', 'https://www.instagram.com/p/A/', 'instagram', 'done', null, now() - interval '1 hour'),
  ('00000000-0000-4000-8000-00000000000b', 'https://www.instagram.com/p/B/', 'instagram', 'failed', 'fetch_failed', now() - interval '3 days'),
  ('00000000-0000-4000-8000-00000000000b', 'https://www.tiktok.com/@x/video/1', 'tiktok', 'done', null, now() - interval '20 days'),
  ('00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/C/', 'instagram', 'done', null, now() - interval '60 days');
insert into public.process_events (user_id, source, stage, detail, created_at) values
  ('00000000-0000-4000-8000-00000000000b', 'function', 'cost', '{"usd":0.25,"input_tokens":1000,"places_calls":2}', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-00000000000b', 'function', 'cost', '{"usd":0.5,"fn":"place-details"}', now() - interval '3 days'),
  ('00000000-0000-4000-8000-00000000000b', 'function', 'cost', '{"usd":2}', now() - interval '60 days'),
  ('00000000-0000-4000-8000-00000000000b', 'function', 'quota', '{"allowed":false}', now() - interval '1 day');

select is(
  array(
    select r || ' ' || p
    from unnest(array['anon', 'authenticated']) r,
      unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where has_table_privilege(r, 'public.admin_users', p)
  ),
  array[]::text[],
  'admin_users: no table privileges for anon or authenticated'
);
select ok(not has_function_privilege('anon', 'public.admin_stats()', 'execute'), 'admin_stats: anon cannot call it');

-- Not admins.
select tests.login('00000000-0000-4000-8000-00000000000b');
select is(public.is_admin(), false, 'ordinary user is not an admin');
select throws_ok($$select public.admin_stats()$$, '42501', 'admins only', 'ordinary user cannot read stats');
select throws_ok($$select * from public.admin_users$$, '42501', null, 'ordinary user cannot read the allowlist');
select tests.login('00000000-0000-4000-8000-00000000000c');
select is(public.is_admin(), false, 'allowlisted email on an unbound account is not an admin');
select throws_ok($$select public.admin_stats()$$, '42501', 'admins only', 'unbound allowlisted email cannot read stats');
select throws_ok($$update public.admin_users set user_id = auth.uid()$$, '42501', null, 'nobody can bind themselves');
select tests.login('00000000-0000-4000-8000-00000000000d');
select is(public.is_admin(), false, 'bound account with an unconfirmed email is not an admin');

-- The admin.
select tests.login('00000000-0000-4000-8000-00000000000a');
select is(public.is_admin(), true, 'bound admin is an admin (email compared case-insensitively)');
select is((public.admin_stats() -> 'users' ->> 'total')::int, 4, 'total users');
select is((public.admin_stats() -> 'users' ->> 'new_7d')::int, 3, 'new users in 7 days');
select is((public.admin_stats() -> 'stashes' ->> 'd1')::int, 1, 'stashes in 24 hours');
select is((public.admin_stats() -> 'stashes' ->> 'd7')::int, 2, 'stashes in 7 days');
select is((public.admin_stats() -> 'stashes' ->> 'd30')::int, 3, 'stashes in 30 days');
select is((public.admin_stats() -> 'stashes' ->> 'total')::int, 4, 'stashes all time');
select is((public.admin_stats() -> 'stashes' ->> 'failed_30d')::int, 1, 'failed stashes in 30 days');
select is(public.admin_stats() -> 'failures_30d', '[{"error":"fetch_failed","count":1}]'::jsonb, 'failure reasons');
select is((public.admin_stats() -> 'active' ->> 'd7')::int, 1, 'active users in 7 days');
select is((public.admin_stats() -> 'costs' ->> 'd1')::numeric, 0.25, 'cost in 24 hours');
select is((public.admin_stats() -> 'costs' ->> 'd30')::numeric, 0.75, 'cost in 30 days');
select is((public.admin_stats() -> 'costs' ->> 'total')::numeric, 2.75, 'cost all time');
select is((public.admin_stats() -> 'costs' ->> 'place_details_30d')::numeric, 0.5, 'place-details cost split out');
select is((public.admin_stats() -> 'costs' ->> 'places_calls_30d')::int, 2, 'Places calls summed');
select is((public.admin_stats() -> 'limits_7d' ->> 'refused_runs')::int, 1, 'refused runs');
select is(jsonb_array_length(public.admin_stats() -> 'daily'), 14, '14 days of history');
select is((public.admin_stats() -> 'daily' -> 13 ->> 'stashes')::int,
  -- The hour-old link is today's unless the test runs in the first hour of a UTC day.
  (now() - interval '1 hour' >= date_trunc('day', now(), 'UTC'))::int, 'today is the last day');

-- Changing the email away from the allowlisted one drops admin rights.
reset role;
update auth.users set email = 'someone-else@example.com' where id = '00000000-0000-4000-8000-00000000000a';
select tests.login('00000000-0000-4000-8000-00000000000a');
select is(public.is_admin(), false, 'admin who changes their email is no longer an admin');

select * from finish();
rollback;
