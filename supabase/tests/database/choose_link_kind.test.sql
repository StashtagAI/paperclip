-- HAN-87: choose_link_kind keeps or moves an ambiguous post's items (links.raw_content.alt_kind). Everything rolls back.
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
grant usage on schema tests to authenticated;

-- User A = ...0a, B = ...0b. Links 1x, categories 2x, lists 3x, items 4x.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.com');
insert into public.categories (id, user_id, kind, name) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-00000000000a', 'travel', 'Packing'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-00000000000a', 'travel', 'Gear'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-00000000000a', 'shop', 'clothing'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-00000000000a', 'eats', 'Cafes');
insert into public.lists (id, user_id, category_id, name, tags) values
  -- 1: only link 11's items. 2: link 12's and an older post's. 3: shop's existing "clothing › bags". 4: link 14's.
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000201', 'Packing cubes', '{travel}'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000202', 'Bags', '{carry-on}'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000203', 'bags', '{deals}'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000204', 'Lisbon', '{}');
insert into public.links (id, user_id, url, platform, status, raw_content) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A1/', 'instagram', 'done',
    '{"list_id":"00000000-0000-4000-8000-000000000301","already_listed":[],"alt_kind":"shop","item_sources":{"Cube set":{"name":"capture","address":"places_lookup","lat":"places_lookup","lng":"places_lookup"},"Shoe bag":{"name":"capture","address":"capture"}}}'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A2/', 'instagram', 'done',
    '{"list_id":"00000000-0000-4000-8000-000000000302","already_listed":["Old"],"alt_kind":"shop"}'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A3/', 'instagram', 'done',
    '{"list_id":"00000000-0000-4000-8000-000000000302"}'),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A4/', 'instagram', 'done',
    '{"list_id":"00000000-0000-4000-8000-000000000304","alt_kind":"do"}'),
  ('00000000-0000-4000-8000-000000000115', '00000000-0000-4000-8000-00000000000b', 'https://www.instagram.com/p/B1/', 'instagram', 'done',
    '{"list_id":"00000000-0000-4000-8000-000000000304","alt_kind":"do"}');
insert into public.items (id, user_id, list_id, link_id, name, address, lat, lng) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000111', 'Cube set', '1 Wrong St', 1, 2),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000111', 'Shoe bag', '2 Shop St', null, null),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000112', 'Duffel', null, null, null),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000112', 'Tote', null, null, null),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000113', 'Backpack', null, null, null),
  ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000303', null, 'tote', null, null, null),
  ('00000000-0000-4000-8000-000000000407', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000114', 'Pastel shop', null, null, null);

select tests.login('00000000-0000-4000-8000-00000000000a');

-- Another user's link, and a kind that wasn't offered, are refused.
select throws_ok($$ select public.choose_link_kind('00000000-0000-4000-8000-000000000115', 'do') $$, 'P0002', 'link not found',
  'cannot choose for another user''s link');
select throws_ok($$ select public.choose_link_kind('00000000-0000-4000-8000-000000000111', 'watch') $$, '22023', null,
  'a kind that was not offered is refused');

-- Keep: nothing moves, the question goes away.
select is(public.choose_link_kind('00000000-0000-4000-8000-000000000114', 'eats'), '00000000-0000-4000-8000-000000000304'::uuid,
  'keep returns the same list');
select is((select raw_content ? 'alt_kind' from public.links where id = '00000000-0000-4000-8000-000000000114'), false,
  'keep clears alt_kind');
select is((select list_id from public.items where id = '00000000-0000-4000-8000-000000000407'), '00000000-0000-4000-8000-000000000304'::uuid,
  'keep leaves the item in place');
select is(public.choose_link_kind('00000000-0000-4000-8000-000000000114', 'do'), '00000000-0000-4000-8000-000000000304'::uuid,
  'once answered, choosing again is a no-op');

-- Move a list that holds only this post's items: the list itself moves to its Shop group (HAN-124), keeping its id;
-- the empty category goes.
select is(public.choose_link_kind('00000000-0000-4000-8000-000000000111', 'shop'), '00000000-0000-4000-8000-000000000301'::uuid,
  'whole-list move keeps the list id');
select is((select c.kind::text || ' › ' || c.name || ' › ' || l.name from public.lists l join public.categories c on c.id = l.category_id
  where l.id = '00000000-0000-4000-8000-000000000301'), 'shop › Travel › Luggage', 'list is now Shop › Travel › Luggage');
select is((select count(*)::int from public.categories where id = '00000000-0000-4000-8000-000000000201'), 0,
  'the emptied Travel category is removed');
select is((select row(address, lat, lng)::text from public.items where id = '00000000-0000-4000-8000-000000000401'), '(,,)',
  'looked-up address and pin are cleared when leaving a place kind');
select is((select address from public.items where id = '00000000-0000-4000-8000-000000000402'), '2 Shop St',
  'an address from the post itself is kept');
select is((select raw_content ? 'alt_kind' from public.links where id = '00000000-0000-4000-8000-000000000111'), false,
  'move clears alt_kind');

-- Move from a list shared with another post into the existing Clothing › Bags list (case-insensitive names): only this post's items
-- move, a duplicate is dropped and reported as already listed, tags merge, the shared list stays.
select is(public.choose_link_kind('00000000-0000-4000-8000-000000000112', 'shop'), '00000000-0000-4000-8000-000000000303'::uuid,
  'merges into the existing Shop › clothing › bags list');
select is((select list_id from public.items where id = '00000000-0000-4000-8000-000000000403'), '00000000-0000-4000-8000-000000000303'::uuid,
  'this post''s item moved');
select is((select count(*)::int from public.items where id = '00000000-0000-4000-8000-000000000404'), 0,
  'this post''s duplicate of an item already there is dropped');
select is((select list_id from public.items where id = '00000000-0000-4000-8000-000000000405'), '00000000-0000-4000-8000-000000000302'::uuid,
  'another post''s item stays in the old list');
select is((select (raw_content->'list_id') || (raw_content->'already_listed') from public.links where id = '00000000-0000-4000-8000-000000000112'),
  '["00000000-0000-4000-8000-000000000303", "Old", "Tote"]'::jsonb, 'list_id points at the new list; the dropped duplicate is listed');
select is((select tags from public.lists where id = '00000000-0000-4000-8000-000000000303'), array['deals', 'carry-on'],
  'tags merge');

-- A plain user can't otherwise rewrite links.
select throws_ok($$ update public.links set raw_content = '{}' where id = '00000000-0000-4000-8000-000000000111' $$, '42501', null,
  'links are still not updatable directly');

select * from finish();
rollback;
