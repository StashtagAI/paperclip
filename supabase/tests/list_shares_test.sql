-- HAN-50: checks for list_shares, get_shared_list and add_shared_list. Run against a scratch database that has every
-- migration applied (e.g. the supabase/postgres Docker image), as the postgres superuser:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/list_shares_test.sql
-- Both claim settings are set because older auth.uid() versions read request.jwt.claim.sub.
-- Everything runs in one transaction that is rolled back. Any failed assert aborts with an error.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'friend@example.com');

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

-- Signed out: can read the list through the token only.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);
do $$
declare j jsonb := public.get_shared_list((select token from t));
begin
  assert j->>'kind' = 'eats' and j->>'category' = 'Restaurants' and j->>'list' = 'Denver', 'list header';
  assert jsonb_array_length(j->'items') = 2, 'both items';
  assert j->'items'->0->>'name' = 'Hop Alley' and j->'items'->0->>'source_url' = 'https://www.instagram.com/p/abc123/', 'source url';
  assert not (j ? 'user_id') and not (j->'items'->0 ? 'user_id'), 'no owner id';
  assert public.get_shared_list('nope') is null, 'unknown token';
  assert public.get_shared_list(null) is null, 'null token';
  begin
    perform 1 from public.list_shares;
    assert false, 'anon must not read share rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_shared_list((select token from t));
    assert false, 'anon must not add';
  exception when insufficient_privilege then null;
  end;
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

-- A adding their own share is a no-op; stop sharing kills the token.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare r jsonb := public.add_shared_list((select token from t));
begin
  assert (r->>'own')::boolean and (r->>'added')::int = 0, 'own share is a no-op';
  assert (select count(*) from public.items) = 2, 'owner unchanged';
  delete from public.list_shares where list_id = '30000000-0000-0000-0000-000000000001';
  assert public.get_shared_list((select token from t)) is null, 'stopped share is gone';
end $$;

-- A brand-new recipient C gets the category and list created.
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'new@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
with s as (insert into public.list_shares (list_id) values ('30000000-0000-0000-0000-000000000001') returning token)
update t set token = (select token from s);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare r jsonb := public.add_shared_list((select token from t));
begin
  assert (r->>'added')::int = 2, 'both items added';
  assert (select name from public.categories) = 'Restaurants' and (select name from public.lists) = 'Denver', 'names copied';
  assert (select tags from public.lists) = '{denver}', 'list tags copied';
end $$;

reset role;
select 'list_shares tests passed' as result;
rollback;
