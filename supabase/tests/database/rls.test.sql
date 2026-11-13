-- HAN-46: row level security regression tests. User A tries to read, change and borrow user B's rows in every table;
-- anon tries the same with no session. Run with scripts/test-db.sh (or `supabase test db`). Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- auth.uid() reads request.jwt.claim.sub on older images and request.jwt.claims on newer ones: set both.
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

-- A = ...0a, B = ...0b. Links 1x, categories 2x, lists 3x, items 4x, link feedback 5x, app feedback 6x, photos 7x.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.com');
insert into public.links (id, user_id, url, platform, status, raw_content) values
  ('00000000-0000-4000-8000-0000000001a0', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/AAA/', 'instagram', 'done', '{"caption":"A caption"}'),
  ('00000000-0000-4000-8000-0000000001b0', '00000000-0000-4000-8000-00000000000b', 'https://www.instagram.com/p/BBB/', 'instagram', 'done', '{"caption":"B secret caption"}');
insert into public.categories (id, user_id, kind, name) values
  ('00000000-0000-4000-8000-0000000002a0', '00000000-0000-4000-8000-00000000000a', 'eats', 'A cafes'),
  ('00000000-0000-4000-8000-0000000002b0', '00000000-0000-4000-8000-00000000000b', 'eats', 'B secret cafes');
insert into public.lists (id, user_id, category_id, name) values
  ('00000000-0000-4000-8000-0000000003a0', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000002a0', 'A city'),
  ('00000000-0000-4000-8000-0000000003b0', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000002b0', 'B secret city');
insert into public.items (id, user_id, list_id, link_id, name) values
  ('00000000-0000-4000-8000-0000000004a0', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000003a0', '00000000-0000-4000-8000-0000000001a0', 'A place'),
  ('00000000-0000-4000-8000-0000000004b0', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000003b0', '00000000-0000-4000-8000-0000000001b0', 'B secret place');
insert into public.process_events (link_id, user_id, source, stage) values
  ('00000000-0000-4000-8000-0000000001a0', '00000000-0000-4000-8000-00000000000a', 'function', 'final'),
  ('00000000-0000-4000-8000-0000000001b0', '00000000-0000-4000-8000-00000000000b', 'function', 'final');
insert into public.link_feedback (id, link_id, user_id, rating) values
  ('00000000-0000-4000-8000-0000000005a0', '00000000-0000-4000-8000-0000000001a0', '00000000-0000-4000-8000-00000000000a', 'up'),
  ('00000000-0000-4000-8000-0000000005b0', '00000000-0000-4000-8000-0000000001b0', '00000000-0000-4000-8000-00000000000b', 'up');
insert into public.feedback (id, user_id, message) values
  ('00000000-0000-4000-8000-0000000006a0', '00000000-0000-4000-8000-00000000000a', 'A feedback'),
  ('00000000-0000-4000-8000-0000000006b0', '00000000-0000-4000-8000-00000000000b', 'B secret feedback');
insert into public.item_photos (id, user_id, item_id, path, alt) values
  ('00000000-0000-4000-8000-0000000007a0', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000004a0',
   '00000000-0000-4000-8000-00000000000a/00000000-0000-4000-8000-0000000004a0/a.jpg', 'A photo'),
  ('00000000-0000-4000-8000-0000000007b0', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000004b0',
   '00000000-0000-4000-8000-00000000000b/00000000-0000-4000-8000-0000000004b0/b.jpg', 'B secret photo');
insert into public.place_lookups (query_key, name, address) values ('cafe|city', 'Cafe', '1 Main St');
insert into public.search_lookups (query_key, fill) values ('cafe|city', '{}');

-- Every table is covered here. A new table fails this until it has RLS and a block below.
select is(
  array(select c.relname::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1),
  array['categories', 'feedback', 'item_photos', 'items', 'link_feedback', 'links', 'lists', 'place_lookups', 'process_events',
    'search_lookups'],
  'public tables are the ones these tests cover'
);
select is(
  array(select c.relname::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  array[]::text[],
  'every public table has row level security on'
);

-- ---------- reads: A sees only A's rows ----------
select tests.login('00000000-0000-4000-8000-00000000000a');
select is((select array_agg(url) from public.links), array['https://www.instagram.com/p/AAA/'], 'links: A sees only own');
select is((select array_agg(name) from public.categories), array['A cafes'], 'categories: A sees only own');
select is((select array_agg(name) from public.lists), array['A city'], 'lists: A sees only own');
select is((select array_agg(name) from public.items), array['A place'], 'items: A sees only own');
select is((select count(*)::int from public.process_events), 1, 'process_events: A sees only own');
select is((select array_agg(id) from public.link_feedback), array['00000000-0000-4000-8000-0000000005a0'::uuid], 'link_feedback: A sees only own');
select is((select array_agg(alt) from public.item_photos), array['A photo'], 'item_photos: A sees only own');
select throws_ok($$select count(*) from public.feedback$$, '42501', null, 'feedback: clients cannot read any, own included');
select is((select count(*)::int from public.place_lookups), 0, 'place_lookups: no client reads');
select is((select count(*)::int from public.search_lookups), 0, 'search_lookups: no client reads');
select is((select count(*)::int from public.items where link_id = '00000000-0000-4000-8000-0000000001b0'), 0, 'items: filtering by B''s link_id finds nothing');

-- ---------- inserts: A cannot write as B or attach to B's rows ----------
select throws_ok($$insert into public.links (user_id, url, platform) values ('00000000-0000-4000-8000-00000000000b', 'https://www.instagram.com/p/X1/', 'instagram')$$,
  '42501', null, 'links: cannot insert for another user');
select throws_ok($$insert into public.links (url, platform, status) values ('https://www.instagram.com/p/X2/', 'instagram', 'done')$$,
  '42501', null, 'links: cannot insert as done');
select throws_ok($$insert into public.links (url, platform, raw_content) values ('https://www.instagram.com/p/X3/', 'instagram', '{"caption":"forged"}')$$,
  '42501', null, 'links: cannot insert raw_content');
select throws_ok($$insert into public.links (url, platform, error) values ('https://www.instagram.com/p/X4/', 'instagram', 'x')$$,
  '42501', null, 'links: cannot insert an error');
select lives_ok($$insert into public.links (url, platform) values ('https://www.instagram.com/p/X5/', 'instagram')$$,
  'links: can insert own pending link');
select throws_ok($$insert into public.categories (user_id, kind, name) values ('00000000-0000-4000-8000-00000000000b', 'eats', 'Planted')$$,
  '42501', null, 'categories: cannot insert for another user');
select throws_ok($$insert into public.lists (category_id, name) values ('00000000-0000-4000-8000-0000000002b0', 'Planted')$$,
  '42501', null, 'lists: cannot add a list to B''s category');
select throws_ok($$insert into public.lists (user_id, category_id, name) values ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000002b0', 'Planted')$$,
  '42501', null, 'lists: cannot insert for another user');
select throws_ok($$insert into public.items (list_id, link_id, name) values ('00000000-0000-4000-8000-0000000003a0', '00000000-0000-4000-8000-0000000001b0', 'Borrowed')$$,
  '42501', null, 'items: cannot cite B''s link_id');
select throws_ok($$insert into public.items (list_id, name) values ('00000000-0000-4000-8000-0000000003b0', 'Planted')$$,
  '42501', null, 'items: cannot add to B''s list');
select throws_ok($$insert into public.items (user_id, list_id, name) values ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000003b0', 'Planted')$$,
  '42501', null, 'items: cannot insert for another user');
select throws_ok($$insert into public.process_events (link_id, source, stage) values ('00000000-0000-4000-8000-0000000001b0', 'client', 'x')$$,
  '42501', null, 'process_events: cannot log against B''s link_id');
select throws_ok($$insert into public.process_events (link_id, source, stage) values ('00000000-0000-4000-8000-0000000001a0', 'function', 'final')$$,
  '42501', null, 'process_events: cannot forge function events');
select throws_ok($$insert into public.process_events (user_id, source, stage) values ('00000000-0000-4000-8000-00000000000b', 'client', 'x')$$,
  '42501', null, 'process_events: cannot insert for another user');
select lives_ok($$insert into public.process_events (link_id, source, stage) values ('00000000-0000-4000-8000-0000000001a0', 'client', 'x')$$,
  'process_events: can log own client event');
select throws_ok($$insert into public.link_feedback (link_id, rating) values ('00000000-0000-4000-8000-0000000001b0', 'down')$$,
  '42501', null, 'link_feedback: cannot rate B''s link_id');
select lives_ok($$insert into public.feedback (message) values ('A again')$$, 'feedback: can send own');
select throws_ok($$insert into public.feedback (user_id, message) values ('00000000-0000-4000-8000-00000000000b', 'Planted')$$,
  '42501', null, 'feedback: cannot send as another user');
select throws_ok($$insert into public.feedback (message, status) values ('x', 'closed')$$,
  '42501', null, 'feedback: cannot insert as already triaged');
select throws_ok($$insert into public.item_photos (item_id, path, alt) values ('00000000-0000-4000-8000-0000000004b0',
    '00000000-0000-4000-8000-00000000000a/00000000-0000-4000-8000-0000000004b0/x.jpg', 'x')$$,
  '42501', null, 'item_photos: cannot attach to B''s item');
select throws_ok($$insert into public.item_photos (item_id, path, alt) values ('00000000-0000-4000-8000-0000000004a0',
    '00000000-0000-4000-8000-00000000000b/00000000-0000-4000-8000-0000000004a0/x.jpg', 'x')$$,
  '42501', null, 'item_photos: cannot point at a path in B''s folder');
select throws_ok($$insert into public.place_lookups (query_key, name, address) values ('x', 'x', 'x')$$,
  '42501', null, 'place_lookups: no client writes');
select throws_ok($$insert into public.search_lookups (query_key, fill) values ('x', '{}')$$,
  '42501', null, 'search_lookups: no client writes');

-- ---------- updates: A cannot move own rows onto B's, or hand them to B ----------
select throws_ok($$update public.links set status = 'done' where id = '00000000-0000-4000-8000-0000000001a0'$$,
  '42501', null, 'links: clients cannot update links at all');
select throws_ok($$update public.items set link_id = '00000000-0000-4000-8000-0000000001b0' where id = '00000000-0000-4000-8000-0000000004a0'$$,
  '42501', null, 'items: cannot repoint own item at B''s link_id');
select throws_ok($$update public.items set list_id = '00000000-0000-4000-8000-0000000003b0' where id = '00000000-0000-4000-8000-0000000004a0'$$,
  '42501', null, 'items: cannot move own item into B''s list');
select throws_ok($$update public.lists set category_id = '00000000-0000-4000-8000-0000000002b0' where id = '00000000-0000-4000-8000-0000000003a0'$$,
  '42501', null, 'lists: cannot move own list into B''s category');
select throws_ok($$update public.item_photos set item_id = '00000000-0000-4000-8000-0000000004b0' where id = '00000000-0000-4000-8000-0000000007a0'$$,
  '42501', null, 'item_photos: cannot move own photo onto B''s item');
select throws_ok($$update public.categories set user_id = '00000000-0000-4000-8000-00000000000b' where id = '00000000-0000-4000-8000-0000000002a0'$$,
  '42501', null, 'categories: cannot hand own row to B');
select throws_ok($$update public.link_feedback set link_id = '00000000-0000-4000-8000-0000000001b0' where id = '00000000-0000-4000-8000-0000000005a0'$$,
  '42501', null, 'link_feedback: cannot repoint own feedback at B''s link_id (snapshot leak)');
-- The snapshot is always rebuilt from A's own link, whatever the client sends.
update public.link_feedback set snapshot = '{"items":[{"name":"forged"}]}' where id = '00000000-0000-4000-8000-0000000005a0';
select is((select snapshot -> 'items' -> 0 ->> 'name' from public.link_feedback where id = '00000000-0000-4000-8000-0000000005a0'),
  'A place', 'link_feedback: client snapshot is ignored');

-- Updates and deletes aimed at B's rows match nothing (checked as the table owner below).
update public.categories set name = 'pwned' where id = '00000000-0000-4000-8000-0000000002b0';
update public.lists set name = 'pwned' where id = '00000000-0000-4000-8000-0000000003b0';
update public.items set name = 'pwned' where id = '00000000-0000-4000-8000-0000000004b0';
update public.link_feedback set rating = 'down' where id = '00000000-0000-4000-8000-0000000005b0';
update public.process_events set stage = 'pwned';
delete from public.links where id = '00000000-0000-4000-8000-0000000001b0';
delete from public.categories where id = '00000000-0000-4000-8000-0000000002b0';
delete from public.lists where id = '00000000-0000-4000-8000-0000000003b0';
delete from public.items where id = '00000000-0000-4000-8000-0000000004b0';
delete from public.link_feedback where id = '00000000-0000-4000-8000-0000000005b0';
update public.item_photos set alt = 'pwned' where id = '00000000-0000-4000-8000-0000000007b0';
delete from public.item_photos where id = '00000000-0000-4000-8000-0000000007b0';
delete from public.process_events where user_id = '00000000-0000-4000-8000-00000000000b';

-- ---------- functions ----------
select throws_ok($$select public.delete_link('00000000-0000-4000-8000-0000000001b0')$$,
  'P0002', null, 'delete_link: B''s link_id looks like a missing link');
select throws_ok($$select public.sweep_stuck_links()$$, '42501', null, 'sweep_stuck_links: not callable by clients');
select throws_ok($$select * from public.user_storage_objects('00000000-0000-4000-8000-00000000000b')$$,
  '42501', null, 'user_storage_objects: not callable by clients');
select throws_ok($$select public.link_feedback_snapshot()$$, '42501', null, 'link_feedback_snapshot: not callable by clients');

-- ---------- anon: no session, no rows ----------
reset role;
select tests.anon();
select is((select count(*)::int from public.links), 0, 'anon: sees no links');
select is((select count(*)::int from public.items), 0, 'anon: sees no items');
select is((select count(*)::int from public.link_feedback), 0, 'anon: sees no feedback');
select throws_ok($$insert into public.links (user_id, url, platform) values ('00000000-0000-4000-8000-00000000000b', 'https://www.instagram.com/p/X6/', 'instagram')$$,
  '42501', null, 'anon: cannot insert links');
select throws_ok($$insert into public.process_events (link_id, user_id, source, stage) values ('00000000-0000-4000-8000-0000000001b0', '00000000-0000-4000-8000-00000000000b', 'client', 'x')$$,
  '42501', null, 'anon: cannot insert events');
select throws_ok($$select public.delete_link('00000000-0000-4000-8000-0000000001b0')$$, '42501', null, 'anon: cannot call delete_link');
select throws_ok($$insert into public.feedback (message) values ('x')$$, '42501', null, 'anon: cannot send feedback');
select is((select count(*)::int from public.item_photos), 0, 'anon: sees no photos');

-- ---------- B's data survived all of the above ----------
reset role;
select is((select status::text from public.links where id = '00000000-0000-4000-8000-0000000001b0'), 'done', 'B''s link intact');
select is((select name from public.categories where id = '00000000-0000-4000-8000-0000000002b0'), 'B secret cafes', 'B''s category intact');
select is((select name from public.lists where id = '00000000-0000-4000-8000-0000000003b0'), 'B secret city', 'B''s list intact');
select is((select name || '|' || link_id from public.items where id = '00000000-0000-4000-8000-0000000004b0'),
  'B secret place|00000000-0000-4000-8000-0000000001b0', 'B''s item intact');
select is((select rating::text from public.link_feedback where id = '00000000-0000-4000-8000-0000000005b0'), 'up', 'B''s feedback intact');
select is((select stage from public.process_events where user_id = '00000000-0000-4000-8000-00000000000b'), 'final', 'B''s events intact');
select is((select alt || '|' || item_id from public.item_photos where id = '00000000-0000-4000-8000-0000000007b0'),
  'B secret photo|00000000-0000-4000-8000-0000000004b0', 'B''s photo intact');
select is((select array_agg(message) from public.feedback where user_id = '00000000-0000-4000-8000-00000000000b'),
  array['B secret feedback'], 'B''s feedback intact');
select is((select count(*)::int from public.items where user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'nothing was planted in B''s lists');

-- ---------- delete_link on own link only removes A's rows ----------
select tests.login('00000000-0000-4000-8000-00000000000a');
select lives_ok($$select public.delete_link('00000000-0000-4000-8000-0000000001a0')$$, 'delete_link: A deletes own link');
reset role;
select is((select count(*)::int from public.items where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'delete_link: A''s items gone');
select is((select count(*)::int from public.categories where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'delete_link: A''s empty category gone');
select is((select count(*)::int from public.items where user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'delete_link: B''s items untouched');

select * from finish();
rollback;
