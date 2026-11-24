-- HAN-124: move_items moves items into one of the user's existing lists, merging same-named ones. Everything rolls back.
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
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-00000000000a', 'eats', 'Saved posts'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-00000000000a', 'eats', 'Restaurants'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-00000000000a', 'shop', 'Beauty'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-00000000000b', 'eats', 'Restaurants');
insert into public.lists (id, user_id, category_id, name) values
  -- 1: Saved posts › Instagram. 2: Restaurants › Denver. 3: Restaurants › Scottsdale. 4: Shop. 5: B's.
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000201', 'Instagram'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000202', 'Denver'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000202', 'Scottsdale'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000203', 'Fragrances'),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000204', 'Denver');
insert into public.links (id, user_id, url, platform, status, raw_content) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A1/', 'instagram', 'done',
    '{"list_id":"00000000-0000-4000-8000-000000000301"}'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A2/', 'instagram', 'done',
    '{"list_id":"00000000-0000-4000-8000-000000000303"}');
insert into public.items (id, user_id, list_id, link_id, name, note, rating, favorited_at, tags) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000111', 'Sushi Den', '', null, null, '{}'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000302',
    null, 'Hop Alley', 'Get the noodles', null, null, '{asian}'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000112', 'hop alley', 'Book ahead', 4, '2026-11-01', '{dinner}'),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000112', 'Citizen Public House', '', null, null, '{}'),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000304',
    null, 'Le Labo', '', null, null, '{}');
insert into public.item_posts (item_id, link_id, user_id) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-00000000000a'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-00000000000a');

-- B can't move A's items or into A's lists.
select tests.login('00000000-0000-4000-8000-00000000000b');
select throws_ok($$ select public.move_items(array['00000000-0000-4000-8000-000000000401'::uuid], '00000000-0000-4000-8000-000000000305') $$,
  'P0002', 'item not found', 'not someone else''s items');
select throws_ok($$ select public.move_items('{}', '00000000-0000-4000-8000-000000000302') $$,
  'P0002', 'list not found', 'not into someone else''s list');

select tests.login('00000000-0000-4000-8000-00000000000a');
select throws_ok($$ select public.move_items(array['00000000-0000-4000-8000-000000000405'::uuid], '00000000-0000-4000-8000-000000000302') $$,
  '22023', null, 'not across kinds');

-- The board's case: Saved posts › Instagram → Restaurants › Denver, where Restaurants already exists.
select is(public.move_items(array['00000000-0000-4000-8000-000000000401'::uuid], '00000000-0000-4000-8000-000000000302'),
  '{"moved": 1, "merged": 0, "skipped": 0}'::jsonb, 'moves one card');
select is((select list_id from public.items where id = '00000000-0000-4000-8000-000000000401'),
  '00000000-0000-4000-8000-000000000302'::uuid, 'the card is in Denver');
select ok(not exists (select 1 from public.lists where id = '00000000-0000-4000-8000-000000000301'), 'the emptied list is gone');
select ok(not exists (select 1 from public.categories where id = '00000000-0000-4000-8000-000000000201'), 'and its emptied category');
select is((select raw_content->>'list_id' from public.links where id = '00000000-0000-4000-8000-000000000111'),
  '00000000-0000-4000-8000-000000000302', 'the post points at Denver');

-- Moving a whole list into one with a same-named item merges it (case-insensitively).
select is(public.move_items(array['00000000-0000-4000-8000-000000000403'::uuid, '00000000-0000-4000-8000-000000000404'::uuid],
    '00000000-0000-4000-8000-000000000302'),
  '{"moved": 1, "merged": 1, "skipped": 0}'::jsonb, 'moves a list, merging the duplicate');
select is((select count(*)::int from public.items where list_id = '00000000-0000-4000-8000-000000000302'), 3, 'Denver has 3 items');
select is(
  (select row(note, rating, favorited_at::date, tags)::text from public.items where id = '00000000-0000-4000-8000-000000000402'),
  row(E'Get the noodles\n\nBook ahead', 4::smallint, '2026-11-01'::date, '{asian,dinner}'::text[])::text,
  'the kept copy has both notes, the rating, the favourite and both tags');
select is(
  array(select link_id from public.item_posts where item_id = '00000000-0000-4000-8000-000000000402'),
  array['00000000-0000-4000-8000-000000000112'::uuid], 'and the post that recommended the dropped copy');
select ok(not exists (select 1 from public.lists where id = '00000000-0000-4000-8000-000000000303'), 'Scottsdale is gone');
select ok(exists (select 1 from public.categories where id = '00000000-0000-4000-8000-000000000202'), 'Restaurants stays');
select is((select raw_content->>'list_id' from public.links where id = '00000000-0000-4000-8000-000000000112'),
  '00000000-0000-4000-8000-000000000302', 'the second post points at Denver too');

select * from finish();
rollback;
