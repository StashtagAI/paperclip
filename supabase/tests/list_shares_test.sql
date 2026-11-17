-- HAN-50 / HAN-68: checks for list_shares, list_share_recipients, get_shared_list, add_shared_list and
-- add_share_recipient. Run against a scratch database that has every
-- migration applied (e.g. the supabase/postgres Docker image), as the postgres superuser:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/list_shares_test.sql
-- Both claim settings are set because older auth.uid() versions read request.jwt.claim.sub.
-- Everything runs in one transaction that is rolled back. Any failed assert aborts with an error.

begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com', now()),
  ('00000000-0000-0000-0000-00000000000b', 'friend@example.com', now()),
  ('00000000-0000-0000-0000-00000000000d', 'stranger@example.com', now()),
  ('00000000-0000-0000-0000-00000000000e', 'unconfirmed@example.com', null);

-- Owner A: Eats > Restaurants > Denver with two items, one from a post. Friend B already has "restaurants" > "denver"
-- with one of those names in different case.
insert into public.links (id, user_id, url, platform, status, tags) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'https://www.instagram.com/p/abc123/', 'instagram', 'done', '{denvereats}');
insert into public.categories (id, user_id, kind, name) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'eats', 'Restaurants'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'eats', 'restaurants');
insert into public.lists (id, user_id, category_id, name, tags) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Denver', '{denver}'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Boulder', '{}'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000002', 'denver', '{}');
insert into public.items (user_id, list_id, link_id, name, description, address, lat, lng) values
  ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Hop Alley', 'Chinese, great noodles', '3500 Larimer St, Denver', 39.7, -104.9),
  ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', null, 'Sunday Vinyl', '', null, null, null),
  ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000003', null, 'sunday vinyl', 'mine', null, null, null);

create temp table t (token text);
grant all on t to authenticated, anon;

-- A shares Denver.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
with s as (insert into public.list_shares (list_id) values ('30000000-0000-0000-0000-000000000001') returning token)
insert into t select token from s;
do $$ begin
  assert (select token ~ '^[0-9a-f]{32}$' from t), 'token is 32 hex chars';
  assert (select count(*) from public.list_shares) = 1, 'owner sees their share';
end $$;

-- B: can't see A's share row, can't share A's list.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  assert (select count(*) from public.list_shares) = 0, 'friend cannot read share rows';
  begin
    insert into public.list_shares (list_id) values ('30000000-0000-0000-0000-000000000002');
    assert false, 'friend must not share the owner''s list';
  exception when insufficient_privilege then null;
  end;
end $$;

-- HAN-68: B isn't a recipient yet, so the valid token answers exactly like an unknown one.
do $$ begin
  assert public.get_shared_list((select token from t)) is null, 'non-recipient gets nothing';
  begin
    perform public.add_shared_list((select token from t));
    assert false, 'non-recipient must not add';
  exception when no_data_found then null;
  end;
  -- B can't add themselves, or anyone, to A's share.
  begin
    perform public.add_share_recipient((select token from t), 'friend@example.com');
    assert false, 'only the owner adds recipients';
  exception when no_data_found then null;
  end;
  begin
    insert into public.list_share_recipients (token, user_id, email)
      values ((select token from t), '00000000-0000-0000-0000-00000000000b', 'friend@example.com');
    assert false, 'no direct inserts';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A adds recipients by email: existing confirmed accounts only, case-insensitive, not themselves.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare tok text := (select token from t);
begin
  assert public.add_share_recipient(tok, '  Friend@Example.com ') = '{"email":"friend@example.com"}', 'adds an account';
  assert public.add_share_recipient(tok, 'friend@example.com') = '{"email":"friend@example.com"}', 'adding twice is fine';
  assert public.add_share_recipient(tok, 'nobody@example.com') = '{"error":"no_account"}', 'unknown email';
  assert public.add_share_recipient(tok, 'unconfirmed@example.com') = '{"error":"no_account"}', 'unconfirmed email does not count';
  assert public.add_share_recipient(tok, 'owner@example.com') = '{"error":"self"}', 'not yourself';
  begin
    perform public.add_share_recipient(tok, 'not an email');
    assert false, 'bad email must fail';
  exception when invalid_parameter_value then null;
  end;
  assert (select count(*) from public.list_share_recipients) = 1, 'owner sees the recipient';
  assert (select email from public.list_share_recipients) = 'friend@example.com', 'stored lowercased';
  begin
    update public.list_share_recipients set email = 'x@example.com';
    assert false, 'no updates';
  exception when insufficient_privilege then null;
  end;
end $$;

-- D, signed in but not a recipient: sees no recipient rows, can't remove them, and the link answers nothing.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ begin
  assert (select count(*) from public.list_share_recipients) = 0, 'other users cannot read recipients';
  delete from public.list_share_recipients;
  assert public.get_shared_list((select token from t)) is null, 'forwarded link answers nothing';
  begin
    perform public.add_shared_list((select token from t));
    assert false, 'forwarded link must not add';
  exception when no_data_found then null;
  end;
end $$;

-- B, now a recipient, reads the list through the token and sees only their own recipient row.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
declare j jsonb := public.get_shared_list((select token from t));
begin
  assert (select count(*) from public.list_share_recipients) = 1, 'recipient sees own row (other users'' delete removed nothing)';
  delete from public.list_share_recipients;
  assert (select count(*) from public.list_share_recipients) = 1, 'recipient cannot remove themselves from the owner''s share';
  assert j->>'kind' = 'eats' and j->>'category' = 'Restaurants' and j->>'list' = 'Denver', 'list header';
  assert jsonb_array_length(j->'items') = 2, 'both items';
  assert j->'items'->0->>'name' = 'Hop Alley' and j->'items'->0->>'source_url' = 'https://www.instagram.com/p/abc123/', 'source url';
  assert not (j ? 'user_id') and not (j->'items'->0 ? 'user_id'), 'no owner id';
  assert public.get_shared_list('nope') is null, 'unknown token';
  assert public.get_shared_list(null) is null, 'null token';
end $$;

-- Signed out (HAN-68): no access at all, not even through the token.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform public.get_shared_list((select token from t));
    assert false, 'anon must not read a shared list';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.list_shares;
    assert false, 'anon must not read share rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.list_share_recipients;
    assert false, 'anon must not read recipients';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_share_recipient((select token from t), 'friend@example.com');
    assert false, 'anon must not add recipients';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_shared_list((select token from t));
    assert false, 'anon must not add';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon', 'public.get_shared_list(text)', 'execute'), 'anon has no execute grant';
  assert not has_function_privilege('anon', 'public.add_shared_list(text)', 'execute'), 'anon has no add grant';
  assert not has_function_privilege('anon', 'public.add_share_recipient(text,text)', 'execute'), 'anon has no recipient grant';
  assert not has_table_privilege('authenticated', 'public.share_recipient_lookups', 'select'), 'lookups are server-side only';
end $$;

-- B adds it: merges into their own "restaurants" > "denver", skips "sunday vinyl", gets their own link for the post.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
declare r jsonb := public.add_shared_list((select token from t));
begin
  assert (r->>'list_id')::uuid = '30000000-0000-0000-0000-000000000003', 'merged into existing list';
  assert (r->>'added')::int = 1 and (r->>'own')::boolean = false, 'one item added';
  assert (select count(*) from public.items) = 2, 'friend sees only own items';
  assert (select k.url from public.items i join public.links k on k.id = i.link_id where i.name = 'Hop Alley')
    = 'https://www.instagram.com/p/abc123/', 'item keeps its source post';
  assert (select status::text from public.links) = 'done', 'copied link is done';
  assert (select user_id from public.links) = '00000000-0000-0000-0000-00000000000b', 'copied link is the friend''s';
  r := public.add_shared_list((select token from t));
  assert (r->>'added')::int = 0, 'adding twice adds nothing';
  assert (select count(*) from public.links) = 1, 'no duplicate link';
  begin
    perform public.add_shared_list('00000000000000000000000000000000');
    assert false, 'unknown token must fail';
  exception when no_data_found then null;
  end;
end $$;

-- A adding their own share is a no-op; removing B cuts B off; stop sharing kills the token and its recipients.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare r jsonb := public.add_shared_list((select token from t));
begin
  assert (r->>'own')::boolean and (r->>'added')::int = 0, 'own share is a no-op';
  assert (select count(*) from public.items) = 2, 'owner unchanged';
  assert public.get_shared_list((select token from t)) is not null, 'owner can read their own share';
  delete from public.list_share_recipients where email = 'friend@example.com';
  assert (select count(*) from public.list_share_recipients) = 0, 'owner removes a recipient';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  assert public.get_shared_list((select token from t)) is null, 'removed recipient is cut off';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  assert public.add_share_recipient((select token from t), 'friend@example.com') ? 'email', 're-added';
  delete from public.list_shares where list_id = '30000000-0000-0000-0000-000000000001';
  assert public.get_shared_list((select token from t)) is null, 'stopped share is gone';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.list_share_recipients) = 0, 'stopping the share removes its recipients';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  assert public.get_shared_list((select token from t)) is null, 'revoked share returns nothing to a former recipient';
end $$;

-- A brand-new recipient C gets the category and list created.
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-00000000000c', 'new@example.com', now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
with s as (insert into public.list_shares (list_id) values ('30000000-0000-0000-0000-000000000001') returning token)
update t set token = (select token from s);
do $$ begin
  assert public.add_share_recipient((select token from t), 'new@example.com') ? 'email', 'C added';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare r jsonb := public.add_shared_list((select token from t));
begin
  assert (r->>'added')::int = 2, 'both items added';
  assert (select name from public.categories) = 'Restaurants' and (select name from public.lists) = 'Denver', 'names copied';
  assert (select tags from public.lists) = '{denver}', 'list tags copied';
end $$;

-- Rate limit: 20 lookups an hour per owner, misses included. Keep looking up until it refuses.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare i int; refused int := 0;
begin
  for i in 1..25 loop
    begin
      perform public.add_share_recipient((select token from t), 'miss' || i || '@example.com');
    exception when program_limit_exceeded then refused := refused + 1;
    end;
  end loop;
  assert refused > 0, 'lookups must be limited';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.share_recipient_lookups where user_id = '00000000-0000-0000-0000-00000000000a') = 20,
    'refused after 20 lookups';
end $$;

reset role;
select 'list_shares tests passed' as result;
rollback;
