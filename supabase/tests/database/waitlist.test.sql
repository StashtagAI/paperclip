-- HAN-100: the launch waitlist is server-only. Clients (anon or signed in) can't read, write, change or delete
-- signups, or call waitlist_signup(); the function dedupes case-insensitively and rate-limits per IP hash.
-- Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- No grants at all for clients, not just no policies (TRUNCATE ignores RLS).
select is(
  array(
    select t || ' ' || r || ' ' || p
    from unnest(array['public.waitlist_signups', 'public.waitlist_attempts']) t,
      unnest(array['anon', 'authenticated']) r,
      unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where has_table_privilege(r, t, p)
  ),
  array[]::text[],
  'waitlist tables: no table privileges for anon or authenticated'
);
select ok(
  not has_function_privilege('anon', 'public.waitlist_signup(text, text, text, jsonb, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.waitlist_signup(text, text, text, jsonb, text)', 'execute'),
  'waitlist_signup: clients cannot call it'
);
select ok(has_function_privilege('service_role', 'public.waitlist_signup(text, text, text, jsonb, text)', 'execute'),
  'waitlist_signup: the service role (edge function) can');

-- Seed as the service role, as the edge function does.
set local role service_role;
select is(public.waitlist_signup('Ana@Example.com', 'ios', 'hero', '{"utm_source":"ig"}', 'ip-1'), 'ok', 'new signup');
select is(public.waitlist_signup('ana@EXAMPLE.com', 'android', 'cta', '{}', 'ip-1'), 'ok', 'duplicate (other case) also says ok');
reset role;
select is((select count(*)::int from public.waitlist_signups), 1, 'duplicate stored once');
select is((select row(email::text, platform, source, utm->>'utm_source')::text from public.waitlist_signups),
  row('ana@example.com', 'ios', 'hero', 'ig')::text, 'first signup kept, lowercased');
select throws_ok($$insert into public.waitlist_signups (email) values ('not-an-email')$$, '23514', null,
  'check constraint rejects a malformed email');
select throws_ok($$insert into public.waitlist_signups (email) values ('Upper@Example.com')$$, '23514', null,
  'check constraint rejects an email that is not lowercased');
select throws_ok($$insert into public.waitlist_signups (email, platform) values ('p@example.com', 'windows')$$, '23514', null,
  'check constraint rejects an unknown platform');

-- Rate limit: 5 per IP in 10 minutes (2 used above), counted per IP hash.
set local role service_role;
select is(public.waitlist_signup('b' || i || '@example.com', null, null, '{}', 'ip-1'), 'ok', 'try ' || (i + 2) || ' from ip-1')
  from generate_series(1, 3) i;
select is(public.waitlist_signup('blocked@example.com', null, null, '{}', 'ip-1'), 'rate_limited', '6th try in 10 minutes is limited');
select is(public.waitlist_signup('other@example.com', null, null, '{}', 'ip-2'), 'ok', 'another IP is not limited');
reset role;
select is((select count(*)::int from public.waitlist_signups where email = 'blocked@example.com'), 0, 'limited signup not stored');
-- 20 per day: age ip-3's attempts past the 10-minute window.
insert into public.waitlist_attempts (ip_hash, created_at) select 'ip-3', now() - interval '1 hour' from generate_series(1, 19);
set local role service_role;
select is(public.waitlist_signup('c1@example.com', null, null, '{}', 'ip-3'), 'ok', '20th try in a day');
select is(public.waitlist_signup('c2@example.com', null, null, '{}', 'ip-3'), 'rate_limited', '21st try in a day is limited');
reset role;
-- Attempts older than a day are purged on the next call.
insert into public.waitlist_attempts (ip_hash, created_at) values ('ip-old', now() - interval '25 hours');
set local role service_role;
select public.waitlist_signup('d@example.com', null, null, '{}', 'ip-4');
reset role;
select is((select count(*)::int from public.waitlist_attempts where ip_hash = 'ip-old'), 0, 'attempts older than 24 hours are deleted');

-- Clients: anon and a signed-in user get nothing.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'a@example.com');
set local role anon;
select throws_ok($$select * from public.waitlist_signups$$, '42501', null, 'anon cannot read signups');
select throws_ok($$insert into public.waitlist_signups (email) values ('x@example.com')$$, '42501', null, 'anon cannot insert directly');
select throws_ok($$update public.waitlist_signups set platform = 'android'$$, '42501', null, 'anon cannot update');
select throws_ok($$delete from public.waitlist_signups$$, '42501', null, 'anon cannot delete');
select throws_ok($$select public.waitlist_signup('x@example.com', null, null, '{}', 'ip-9')$$, '42501', null, 'anon cannot call waitlist_signup');
select throws_ok($$select * from public.waitlist_attempts$$, '42501', null, 'anon cannot read attempts');
reset role;
select set_config('role', 'authenticated', true), set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select throws_ok($$select * from public.waitlist_signups$$, '42501', null, 'signed-in user cannot read signups');
select throws_ok($$delete from public.waitlist_signups$$, '42501', null, 'signed-in user cannot delete');
select throws_ok($$select public.waitlist_signup('x@example.com', null, null, '{}', 'ip-9')$$, '42501', null,
  'signed-in user cannot call waitlist_signup');
reset role;

select * from finish();
rollback;
