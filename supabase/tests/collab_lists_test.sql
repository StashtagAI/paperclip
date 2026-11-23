-- HAN-125: checks for collaborative shared lists: get_collab_list, get_recipes, add_items_to_list, remove_shared_item,
-- get_shared_with_me's list_id and link_overview's not_sorted for shared-list post links. Run as list_shares_test.sql
-- is (scripts/test-db.sh). One transaction, rolled back; any failed assert aborts with an error.

begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com', now()),
  ('00000000-0000-0000-0000-00000000000b', 'friend@example.com', now()),
  ('00000000-0000-0000-0000-00000000000d', 'stranger@example.com', now());

-- Owner A: Recipes > Dinners > Weeknight with Pasta (from post L1, with recipe details) and a private note and rating;
-- Recipes > Desserts > Cakes with "Lemon cake" from the same post. Friend B: Recipes > dinners > Mine with
-- Tacos (post L2, recipe details) and "pasta", and Eats > Pizza > Denver with Pizzeria.
insert into public.links (id, user_id, url, platform, status, tags, raw_content) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'https://www.instagram.com/p/pasta/', 'instagram', 'done', '{dinner}',
   '{"caption": "pasta", "recipe_details": {"Pasta": {"ingredients": ["noodles"], "steps": ["boil"]}, "Lemon cake": {"ingredients": ["lemon"], "steps": ["bake"]}}}'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b',
   'https://www.instagram.com/p/tacos/', 'instagram', 'done', '{tacos}',
   '{"caption": "tacos", "recipe_details": {"Tacos": {"ingredients": ["tortillas"], "steps": ["fill"]}}, "item_sources": {"Tacos": {"name": "caption"}}}');
insert into public.categories (id, user_id, kind, name) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'recipes', 'Dinners'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'recipes', 'Desserts'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'recipes', 'dinners'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', 'eats', 'Pizza');
insert into public.lists (id, user_id, category_id, name) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Weeknight'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002', 'Cakes'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000003', 'Mine'),
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000004', 'Denver');
insert into public.items (id, user_id, list_id, link_id, name, note, rating) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'Pasta', 'secret note', 5),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001', 'Lemon cake', '', null),
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000002', 'Tacos', 'my note', 4),
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000003',
   null, 'pasta', '', null),
  ('40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000004',
   null, 'Pizzeria', '', null);
insert into public.item_posts (item_id, link_id, user_id)
  select id, link_id, user_id from public.items where link_id is not null;

-- A shares Weeknight with B.
insert into public.list_shares (token, list_id, user_id) values
  ('0123456789abcdef0123456789abcdef', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a');
insert into public.list_share_recipients (token, user_id, email) values
  ('0123456789abcdef0123456789abcdef', '00000000-0000-0000-0000-00000000000b', 'friend@example.com');
insert into public.profiles (user_id, display_name) values ('00000000-0000-0000-0000-00000000000a', 'Sam');

create temp table t (copy_id uuid, stub_link uuid);
grant all on t to authenticated;
insert into t values (null, null);

set local role authenticated;

-- Clients can't call the internal helper.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  begin
    perform public.shared_list_ids();
    assert false, 'shared_list_ids must not be callable by clients';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B sees the list in Shared with me (with its id) and reads it, without A's note or rating; the tables stay closed.
do $$
declare
  j jsonb;
begin
  assert (select list_id from public.get_shared_with_me()) = '30000000-0000-0000-0000-000000000001', 'list_id returned';
  j := public.get_collab_list('30000000-0000-0000-0000-000000000001');
  assert j->>'category' = 'Dinners' and j->>'list' = 'Weeknight' and j->>'kind' = 'recipes', 'collab list header';
  assert j->>'shared_by' = 'Sam', 'shared_by is the owner''s display name';
  assert jsonb_array_length(j->'items') = 1, 'one item';
  assert j->'items'->0->>'id' = '40000000-0000-0000-0000-000000000001', 'item id included';
  assert j->'items'->0->>'source_url' = 'https://www.instagram.com/p/pasta/', 'source post included';
  assert not (j::text like '%secret note%') and (j->'items'->0->'rating') is null, 'no note or rating';
  assert (select count(*) from public.items where user_id = '00000000-0000-0000-0000-00000000000a') = 0, 'items RLS unchanged';
  assert (select count(*) from public.lists where user_id = '00000000-0000-0000-0000-00000000000a') = 0, 'lists RLS unchanged';
  assert (select count(*) from public.link_overview) = 1, 'friend''s stashes hold only their own links';
  assert public.get_collab_list('30000000-0000-0000-0000-000000000002') is null, 'unshared list is null';
  assert public.get_collab_list('30000000-0000-0000-0000-000000000003') is null, 'own list is null';
  j := public.get_shared_list('0123456789abcdef0123456789abcdef');
  assert j->>'list_id' = '30000000-0000-0000-0000-000000000001' and (j->>'own')::boolean = false, 'link gives list_id';
end $$;

-- B's recipes: their own, and the shared one; link_id only for B's own post.
do $$
declare
  r record;
begin
  select * into r from public.get_recipes(array['40000000-0000-0000-0000-000000000001'::uuid]);
  assert r.recipe_details->'ingredients'->>0 = 'noodles', 'shared recipe details';
  assert r.link_id is null and r.list_name = 'Weeknight', 'no link id for the owner''s post';
  select * into r from public.get_recipes(array['40000000-0000-0000-0000-000000000003'::uuid]);
  assert r.link_id = '10000000-0000-0000-0000-000000000002', 'own link id';
  assert (select count(*) from public.get_recipes(array['40000000-0000-0000-0000-000000000002'::uuid])) = 0,
    'A''s unshared recipe is hidden';
end $$;

-- B adds Tacos (copied), "pasta" (skipped: Pasta is there), Pizzeria (an Eats item: ignored) and A's Lemon cake (not
-- B's: ignored).
do $$
declare
  j jsonb;
begin
  j := public.add_items_to_list('30000000-0000-0000-0000-000000000001', array[
    '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004',
    '40000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000002']::uuid[]);
  assert (j->>'added')::int = 1 and (j->>'skipped')::int = 1, format('added 1, skipped 1: %s', j);
  j := public.get_collab_list('30000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(j->'items') = 2, 'two items now';
  update t set copy_id = (select (e->>'id')::uuid from jsonb_array_elements(j->'items') e where e->>'name' = 'Tacos');
  assert (select copy_id from t) is not null, 'Tacos copied';
  assert (select count(*) from public.items where name = 'Tacos') = 1, 'B''s own Tacos untouched and the copy isn''t B''s';
  assert (select recipe_details->'steps'->>0 from public.get_recipes(array[(select copy_id from t)])) = 'fill',
    'copy keeps its recipe';
end $$;

-- A sees the copy as their own item, on their own post link carrying the recipe, without B's note or rating.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare
  i public.items;
  k public.links;
begin
  select * into i from public.items where id = (select copy_id from t);
  assert i.list_id = '30000000-0000-0000-0000-000000000001' and i.note = '' and i.rating is null, 'copy without note';
  select * into k from public.links where id = i.link_id;
  assert k.url = 'https://www.instagram.com/p/tacos/' and k.status = 'done', 'owner link for the post';
  assert k.raw_content->>'source' = 'shared_list', 'marked as a shared-list link';
  assert k.raw_content->'recipe_details'->'Tacos'->'steps'->>0 = 'fill', 'recipe details carried';
  assert k.raw_content->'item_sources'->'Tacos'->>'name' = 'caption', 'field sources carried';
  assert exists (select 1 from public.item_posts where item_id = i.id and link_id = k.id), 'item_posts row';
  update t set stub_link = k.id;
  -- Owner adding their own Lemon cake to their own list reuses their post link.
  assert (public.add_items_to_list('30000000-0000-0000-0000-000000000001',
    array['40000000-0000-0000-0000-000000000002'::uuid])->>'added')::int = 1, 'owner adds own item';
  assert (select link_id from public.items where list_id = '30000000-0000-0000-0000-000000000001' and name = 'Lemon cake')
    = '10000000-0000-0000-0000-000000000001', 'own link reused';
  -- remove_shared_item is for friends; the owner deletes directly.
  begin
    perform public.remove_shared_item((select copy_id from t));
    assert false, 'owner must not use remove_shared_item on their own list';
  exception when no_data_found then null;
  end;
end $$;

-- A stranger can't read, add to or remove from the list.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ begin
  assert public.get_collab_list('30000000-0000-0000-0000-000000000001') is null, 'stranger reads nothing';
  assert (select count(*) from public.get_recipes(array['40000000-0000-0000-0000-000000000001'::uuid])) = 0, 'no recipes';
  begin
    perform public.add_items_to_list('30000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000003'::uuid]);
    assert false, 'stranger must not add';
  exception when no_data_found then null;
  end;
  begin
    perform public.remove_shared_item((select copy_id from t));
    assert false, 'stranger must not remove';
  exception when no_data_found then null;
  end;
end $$;

-- B removes the Tacos copy (its shared-list post link goes too) and A's Pasta (A's own post stays). B can't use it on
-- B's own list.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  perform public.remove_shared_item((select copy_id from t));
  perform public.remove_shared_item('40000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(public.get_collab_list('30000000-0000-0000-0000-000000000001')->'items') = 1, 'Lemon cake left';
  begin
    perform public.remove_shared_item('40000000-0000-0000-0000-000000000004');
    assert false, 'not for own lists';
  exception when no_data_found then null;
  end;
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.links where id = (select stub_link from t)), 'shared-list link removed';
  assert exists (select 1 from public.links where id = '10000000-0000-0000-0000-000000000001'), 'owner''s own post kept';
end $$;

-- A deleting a friend's copy directly leaves its post link, which isn't "not sorted".
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select public.add_items_to_list('30000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000003'::uuid]);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
delete from public.items where name = 'Tacos';
do $$ begin
  assert (select not not_sorted from public.link_overview where url = 'https://www.instagram.com/p/tacos/'),
    'shared-list link is not "not sorted"';
end $$;

-- Stopping the share ends access.
delete from public.list_shares where list_id = '30000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true),
  set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  assert public.get_collab_list('30000000-0000-0000-0000-000000000001') is null, 'no access after stop';
  begin
    perform public.add_items_to_list('30000000-0000-0000-0000-000000000001', array['40000000-0000-0000-0000-000000000003'::uuid]);
    assert false, 'no adding after stop';
  exception when no_data_found then null;
  end;
end $$;

do $$ begin raise notice 'collab_lists tests passed'; end $$;
rollback;
