-- HAN-124: shop_group picks the category and group, and file_link files products in Shop › <category> › <group>.
-- Everything rolls back.
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

-- Same cases as shop-groups.ts tests (scope, category, item names).
select is(public.shop_group(array['Men''s fragrances', 'Fragrances', 'Parfums de Marly Layton']), array['Beauty', 'Fragrances'], 'straight apostrophe');
select is(public.shop_group(array['Men’s fragrances', 'Saved posts', 'Strongest Fragrances in my Collection']), array['Beauty', 'Fragrances'], 'curly apostrophe');
select is(public.shop_group(array[null, 'Skincare', 'CeraVe cleanser']), array['Beauty', 'Skincare'], 'skincare');
select is(public.shop_group(array['Travel makeup bag', 'Bags']), array['Beauty', 'Makeup'], 'product before bag');
select is(public.shop_group(array['Weekend duffel bag', 'Bags']), array['Travel', 'Luggage'], 'luggage before bags');
select is(public.shop_group(array['Carry-on essentials', 'Travel']), array['Travel', 'Luggage'], 'carry-on');
select is(public.shop_group(array['Travel gadgets', 'Travel']), array['Tech', 'Gadgets'], 'gadgets');
select is(public.shop_group(array['Trip must-haves', 'Travel']), array['Travel', 'Travel accessories'], 'broad travel');
select is(public.shop_group(array['Bath towels', 'Home']), array['Home', 'Bedding & bath'], 'towels');
select is(public.shop_group(array['Amazon finds', 'Home', 'Cordless drill']), array['Home', 'Tools & DIY'], 'item name before broad category');
select is(public.shop_group(array['Amazon finds', 'Home', 'Thing']), array['Home', 'Other home'], 'broad category');
select is(public.shop_group(array['Gifts for him', 'Gifts', 'Leather wallet']), array['Clothing', 'Bags'], 'wallet');
select is(public.shop_group(array['Fall outfits', 'Style']), array['Clothing', 'Clothes'], 'outfits');
select is(public.shop_group(array['Laptops', 'Tech']), array['Tech', 'Computers'], 'laptops');
select is(public.shop_group(array['Dog toys', 'Pets']), array['Pets', 'Pet supplies'], 'pets before toys');
select is(public.shop_group(array['Pantry staples', 'Food & drink']), array['Food & drink', 'Groceries'], 'groceries');
select is(public.shop_group(array['Cool stuff']), array['Other', 'Saved posts'], 'the fallback');
select is(public.shop_group(array['Best headphones']), array['Tech', 'Audio'], 'whole words only');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000000a', 'a@example.com');
insert into public.links (id, user_id, url, platform, status, error, raw_content) values
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A1/', 'instagram', 'done', null,
    '{"unsorted":true,"caption":"My top 25 fragrances of all time"}'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A2/', 'instagram', 'done', null,
    '{"unsorted":true,"caption":"So good"}'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-00000000000a', 'https://www.instagram.com/p/A3/', 'instagram', 'done', null,
    '{"unsorted":true,"caption":"Cute"}');
select tests.login('00000000-0000-4000-8000-00000000000a');

select lives_ok($$ select public.file_link('00000000-0000-4000-8000-000000000111', 'shop', 'Worth the money') $$, 'files a product');
select lives_ok($$ select public.file_link('00000000-0000-4000-8000-000000000112', 'shop', 'Mug') $$, 'files a product with no type');
select lives_ok($$ select public.file_link('00000000-0000-4000-8000-000000000113', 'watch', 'Show') $$, 'files a show');
select is(
  array(select c.kind || ' › ' || c.name || ' › ' || l.name from public.items i join public.lists l on l.id = i.list_id
          join public.categories c on c.id = l.category_id order by i.link_id),
  array['shop › Beauty › Fragrances', 'shop › Other › Saved posts', 'watch › Saved posts › Instagram'],
  'products go to Shop › <category> › <group> from the caption, else Other › Saved posts; other kinds are unchanged');

select * from finish();
rollback;
