-- HAN-124: recipe_group picks the meal, and file_link files recipes in Recipes › <meal>. Everything rolls back.
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

-- Same cases as recipe-groups.ts tests.
select is(public.recipe_group(array['Warm breakfast', 'Recipes']), 'Breakfast', 'breakfast from the scope');
select is(public.recipe_group(array['Snack', 'Recipes', 'Snickers Banana Bark', 'dessert']), 'Snacks', 'the scope wins over tags');
select is(public.recipe_group(array['Appetizers & easy dinners']), 'Snacks', 'snacks before dinner in one text');
select is(public.recipe_group(array['Holiday fusion drinks']), 'Drinks', 'drinks');
select is(public.recipe_group(array['Holiday cookies']), 'Desserts', 'desserts');
select is(public.recipe_group(array['Thanksgiving', 'Recipes', 'Herb roasted turkey']), 'Dinner', 'dinner when nothing matches');
select is(public.recipe_group(array['Steak at a fair price']), 'Dinner', 'whole words only');
select is(public.recipe_group(array['Persimmon season', null], 'Saved posts'), 'Saved posts', 'the fallback');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'a@example.com');
insert into public.links (id, user_id, url, platform, status, error, raw_content) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A1/', 'instagram', 'done', null,
    '{"unsorted":true,"caption":"Two ingredient chocolate mousse"}'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A2/', 'instagram', 'done', null,
    '{"unsorted":true,"caption":"So good"}'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A3/', 'instagram', 'done', null,
    '{"unsorted":true,"caption":"Cute"}');
select tests.login('00000000-0000-4000-8000-00000000000a');

select lives_ok($$ select public.file_link('00000000-0000-4000-8000-000000000111', 'recipes', 'Persimmon season') $$, 'files a recipe');
select lives_ok($$ select public.file_link('00000000-0000-4000-8000-000000000112', 'recipes', 'Grandma special') $$, 'files a recipe with no meal');
select lives_ok($$ select public.file_link('00000000-0000-4000-8000-000000000113', 'watch', 'Mug') $$, 'files a show');
select is(
  array(select c.kind || ' › ' || c.name || ' › ' || l.name from public.items i join public.lists l on l.id = i.list_id
          join public.categories c on c.id = l.category_id order by i.link_id),
  array['recipes › Recipes › Desserts', 'recipes › Recipes › Saved posts', 'watch › Saved posts › Instagram'],
  'recipes go to Recipes › <meal> from the caption, else Recipes › Saved posts; other kinds are unchanged');

select * from finish();
rollback;
