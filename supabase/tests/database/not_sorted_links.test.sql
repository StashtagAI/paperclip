-- HAN-89: not-sorted stashes (done, nothing filed) in link_overview, filed by hand with file_link, dismissed with
-- dismiss_link. Everything rolls back.
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
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-00000000000a', 'shop', 'saved posts'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-00000000000a', 'eats', 'Cafes');
insert into public.lists (id, user_id, category_id, name) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000201', 'instagram'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000202', 'Lisbon');
insert into public.links (id, user_id, url, platform, status, error, raw_content) values
  -- 11: not sorted. 12: filed. 13: done but every item was already listed. 14: needs text. 15: B's not sorted.
  -- 16: not sorted TikTok. 17: not sorted, its name is already in the shop list.
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A1/', 'instagram', 'done', null,
    '{"unsorted":true,"caption":"Festive chocolate treat\n#chocolate"}'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A2/', 'instagram', 'done', null,
    '{"list_id":"00000000-0000-4000-8000-000000000302","already_listed":[]}'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A3/', 'instagram', 'done', null,
    '{"list_id":"00000000-0000-4000-8000-000000000302","already_listed":["Pastel shop"]}'),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A4/', 'instagram', 'pending', 'needs_capture', null),
  ('00000000-0000-4000-8000-000000000115', '00000000-0000-4000-8000-00000000000b', 'https://www.instagram.com/p/B1/', 'instagram', 'done', null,
    '{"unsorted":true}'),
  ('00000000-0000-4000-8000-000000000116', '00000000-0000-4000-8000-00000000000a', 'https://www.tiktok.com/@a/video/1', 'tiktok', 'done', null,
    '{"unsorted":true}'),
  ('00000000-0000-4000-8000-000000000117', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A7/', 'instagram', 'done', null,
    '{"unsorted":true}');
insert into public.items (id, user_id, list_id, link_id, name) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000112', 'Pastel shop'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000301', null, 'Gift box');

select tests.login('00000000-0000-4000-8000-00000000000a');

-- link_overview: only A's links, and only done links with nothing filed are not sorted.
select is((select count(*)::int from public.link_overview), 6, 'link_overview shows only the caller''s links');
select is(
  array(select right(id::text, 3) from public.link_overview where not_sorted order by id),
  array['111', '116', '117'],
  'not_sorted: done with no items and nothing already listed');
select is((select caption from public.link_overview where id = '00000000-0000-4000-8000-000000000111'),
  E'Festive chocolate treat\n#chocolate', 'link_overview has the caption');

-- dismiss_link
select throws_ok($$ select public.dismiss_link('00000000-0000-4000-8000-000000000115') $$, 'P0002', 'link not found',
  'cannot dismiss another user''s link');
select lives_ok($$ select public.dismiss_link('00000000-0000-4000-8000-000000000111') $$, 'dismiss own link');
select isnt((select dismissed_at from public.link_overview where id = '00000000-0000-4000-8000-000000000111'), null,
  'dismissed_at is set');
select throws_ok($$ update public.links set dismissed_at = null where id = '00000000-0000-4000-8000-000000000111' $$,
  '42501', null, 'clients still cannot update links directly');

-- file_link: refusals
select throws_ok($$ select public.file_link('00000000-0000-4000-8000-000000000115', 'shop', 'X') $$, 'P0002', 'link not found',
  'cannot file another user''s link');
select throws_ok($$ select public.file_link('00000000-0000-4000-8000-000000000112', 'shop', 'X') $$, '55000', null,
  'a link that already has items is refused');
select throws_ok($$ select public.file_link('00000000-0000-4000-8000-000000000114', 'shop', 'X') $$, '55000', null,
  'a link still waiting for text is refused');
select throws_ok($$ select public.file_link('00000000-0000-4000-8000-000000000111', 'shop', '   ') $$, '22023', null,
  'a blank name is refused');

-- file_link: into an existing "saved posts › instagram" (matched case-insensitively).
select is(public.file_link('00000000-0000-4000-8000-000000000111', 'shop', '  Festive chocolate treat '),
  '00000000-0000-4000-8000-000000000301'::uuid, 'files into the existing Saved posts list, case-insensitively');
select is(
  (select row(name, description, list_id)::text from public.items where link_id = '00000000-0000-4000-8000-000000000111'),
  row('Festive chocolate treat', E'Festive chocolate treat\n#chocolate', '00000000-0000-4000-8000-000000000301'::uuid)::text,
  'one item with the trimmed name and the caption as description');
select is(
  (select row(not_sorted, dismissed_at)::text from public.link_overview where id = '00000000-0000-4000-8000-000000000111'),
  row(false, null::timestamptz)::text, 'filed: no longer not sorted, and no longer dismissed');
select is(
  (select raw_content - 'caption' from public.links where id = '00000000-0000-4000-8000-000000000111'),
  '{"list_id":"00000000-0000-4000-8000-000000000301","already_listed":[]}'::jsonb, 'unsorted flag cleared, list_id set');
select throws_ok($$ select public.file_link('00000000-0000-4000-8000-000000000111', 'eats', 'Again') $$, '55000', null,
  'filing twice is refused');

-- file_link: new category and list, named after the platform.
select ok(public.file_link('00000000-0000-4000-8000-000000000116', 'do', 'A dance') is not null, 'files a TikTok link');
select is(
  (select row(c.kind, c.name, l.name)::text from public.items i join public.lists l on l.id = i.list_id
     join public.categories c on c.id = l.category_id where i.link_id = '00000000-0000-4000-8000-000000000116'),
  row('do'::public.list_kind, 'Saved posts', 'TikTok')::text, 'creates Do › Saved posts › TikTok');

-- file_link: a name already in the list is kept, recorded as already listed, and the link counts as filed.
select is(public.file_link('00000000-0000-4000-8000-000000000117', 'shop', 'GIFT BOX'),
  '00000000-0000-4000-8000-000000000301'::uuid, 'files into the list that already has the name');
select is((select count(*)::int from public.items where list_id = '00000000-0000-4000-8000-000000000301' and lower(name) = 'gift box'),
  1, 'the existing item is not duplicated');
select is((select raw_content->'already_listed' from public.links where id = '00000000-0000-4000-8000-000000000117'),
  '["GIFT BOX"]'::jsonb, 'the name is recorded as already listed');
select is((select not_sorted from public.link_overview where id = '00000000-0000-4000-8000-000000000117'), false,
  'a link whose name was already listed is not "not sorted"');

-- anon can't call either function or read the view.
reset role;
set local role anon;
select throws_ok($$ select public.dismiss_link('00000000-0000-4000-8000-000000000111') $$, '42501', null, 'anon cannot dismiss');
select throws_ok($$ select public.file_link('00000000-0000-4000-8000-000000000111', 'shop', 'X') $$, '42501', null, 'anon cannot file');
select throws_ok($$ select * from public.link_overview $$, '42501', null, 'anon cannot read link_overview');

select * from finish();
rollback;
