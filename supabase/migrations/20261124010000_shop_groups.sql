-- HAN-124: Shop is filed as Shop › <category> › <group> (Beauty › Fragrances, Home › Kitchen…) from one fixed table
-- instead of whatever category and list the model named for each post. process-link does this for new posts
-- (shop-groups.ts); this migration adds the same rule in SQL for file_link and choose_link_kind, and regroups the
-- products already saved.

-- {category, group} for the first text that names a product type, else the first that names a broad one (Beauty,
-- Home…), else {Other, Saved posts}. Same table, same order, as supabase/functions/process-link/shop-groups.ts; keep
-- the two in step.
create or replace function public.shop_group(p_texts text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce((
    select array[g.cat, g.grp]
      from unnest(p_texts) with ordinality t (txt, n)
      cross join (values
        (1, false, 'Beauty', 'Fragrances', '\y(fragrances?|perfumes?|colognes?|scents?|parfums?|eau de|edp|edt)\y'),
        (2, false, 'Beauty', 'Skincare', '\y(skin ?care|serums?|moisturi[sz]ers?|cleansers?|sunscreens?|spf|retinol|toners?|face masks?|eye creams?|lip balms?)\y'),
        (3, false, 'Beauty', 'Makeup', '\y(make ?up|lipsticks?|lip gloss(es)?|mascaras?|foundations?|concealers?|blush(es)?|eyeshadows?|eyeliners?|bronzers?|highlighters?|primers?)\y'),
        (4, false, 'Beauty', 'Hair care', '\y(hair ?care|shampoos?|conditioners?|hair (oils?|masks?|dryers?|tools?|products?)|curling irons?|straighteners?)\y'),
        (5, false, 'Beauty', 'Nails', '\y(nails?|nail polish(es)?|manicures?)\y'),
        (6, false, 'Beauty', 'Bath & body', '\y(body (wash|lotion|oil|scrub|butter)s?|bath (bombs?|salts?|oils?)|bubble bath|shower gels?|deodorants?|soaps?|razors?|shaving)\y'),
        (7, false, 'Tech', 'Audio', '\y(headphones?|earbuds?|airpods|speakers?|soundbars?)\y'),
        (8, false, 'Tech', 'Phones & accessories', '\y(phones?|iphones?|chargers?|charging|cables?|power banks?|magsafe)\y'),
        (9, false, 'Tech', 'Computers', '\y(laptops?|computers?|macbooks?|ipads?|tablets?|keyboards?|monitors?)\y'),
        (10, false, 'Tech', 'Smart home', '\y(smart (home|plugs?|lights?|bulbs?)|alexa|robot vacuums?|video doorbells?)\y'),
        (11, false, 'Tech', 'Gaming', '\y(gaming|consoles?|playstation|ps5|xbox|nintendo)\y'),
        (12, false, 'Tech', 'Cameras', '\y(cameras?|gopros?|drones?)\y'),
        (13, false, 'Tech', 'Gadgets', '\y(gadgets?|smart ?watch(es)?|apple watch(es)?|kindles?|e-?readers?)\y'),
        (14, false, 'Travel', 'Luggage', '\y(suitcases?|luggage|carry[- ]?ons?|duffels?|packing cubes?|garment bags?)\y'),
        (15, false, 'Home', 'Kitchen', '\y(kitchen|cookware|pans?|knives|knife|air ?fryers?|blenders?|coffee (makers?|machines?)|espresso|utensils|appliances?)\y'),
        (16, false, 'Home', 'Furniture', '\y(furniture|sofas?|couch(es)?|chairs?|tables?|desks?|dressers?|shel(f|ves)|bookcases?)\y'),
        (17, false, 'Home', 'Bedding & bath', '\y(bedding|sheets|duvets?|comforters?|towels?|mattress(es)?)\y'),
        (18, false, 'Home', 'Decor', '\y(decor|décor|rugs?|lamps?|lighting|candles?|vases?|wall art|mirrors?|throw pillows?|curtains?)\y'),
        (19, false, 'Home', 'Cleaning & storage', '\y(cleaning|cleaners?|vacuums?|mops?|laundry|organi[sz](ation|ers?)|storage)\y'),
        (20, false, 'Home', 'Tools & DIY', '\y(tools?|drills?|diy|hardware)\y'),
        (21, false, 'Home', 'Garden & outdoor', '\y(garden(ing)?|plants?|planters?|patio|grills?|bbq)\y'),
        (22, false, 'Clothing', 'Shoes', '\y(shoes?|sneakers?|trainers?|boots?|sandals?|heels|loafers?)\y'),
        (23, false, 'Clothing', 'Bags', '\y(bags?|handbags?|purses?|backpacks?|totes?|wallets?)\y'),
        (24, false, 'Clothing', 'Jewelry & watches', '\y(jewell?ery|necklaces?|rings?|earrings?|bracelets?|watch(es)?)\y'),
        (25, false, 'Clothing', 'Accessories', '\y(sunglasses|hats?|caps?|belts?|scarf|scarves|gloves)\y'),
        (26, false, 'Clothing', 'Clothes', '\y(clothes|clothing|outfits?|dress(es)?|jeans|shirts?|t-shirts?|tops?|jackets?|coats?|sweaters?|hoodies?|pants|trousers|leggings|activewear|loungewear|swimwear)\y'),
        (27, false, 'Travel', 'Travel accessories', '\y(passport|neck pillows?|travel (pillows?|adapters?|accessor(y|ies)|bottles?))\y'),
        (28, false, 'Fitness', 'Workout gear', '\y(gym|workouts?|fitness|yoga|weights|dumbbells?|kettlebells?|resistance bands?|treadmills?|exercise)\y'),
        (29, false, 'Pets', 'Pet supplies', '\y(pets?|dogs?|puppy|puppies|cats?|kittens?)\y'),
        (30, false, 'Kids', 'Toys', '\y(toys?|lego)\y'),
        (31, false, 'Kids', 'Baby', '\y(baby|babies|strollers?|nursery|diapers?|toddlers?)\y'),
        (32, false, 'Food & drink', 'Groceries', '\y(snacks?|sauces?|spices?|seasonings?|coffee|tea|wine|pantry|grocer(y|ies)|chocolate)\y'),
        (33, true, 'Beauty', 'Other beauty', '\y(beauty|cosmetics|self ?care)\y'),
        (34, true, 'Clothing', 'Clothes', '\y(fashion|style|wardrobe)\y'),
        (35, true, 'Tech', 'Gadgets', '\y(tech|electronics)\y'),
        (36, true, 'Travel', 'Travel accessories', '\y(travel|trips?)\y'),
        (37, true, 'Kids', 'Other kids', '\y(kids?|children)\y'),
        (38, true, 'Food & drink', 'Groceries', '\y(food|drinks?)\y'),
        (39, true, 'Home', 'Other home', '\y(home|house|apartment)\y')
      ) g (ord, broad, cat, grp, re)
      where lower(t.txt) ~ g.re
      order by g.broad, t.n, g.ord
      limit 1
  ), array['Other', 'Saved posts']);
$$;

revoke execute on function public.shop_group(text[]) from public, anon;
grant execute on function public.shop_group(text[]) to authenticated, service_role;

-- file_link (HAN-89), as in 20261123200000_recipe_groups.sql, except that Shop goes to Shop › <category> › <group>,
-- read from the name and caption; a post that names no product type goes to Other › Saved posts.
create or replace function public.file_link(p_link_id uuid, p_kind public.list_kind, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_link public.links;
  v_name text := trim(coalesce(p_name, ''));
  v_cat_name text;
  v_list_name text;
  v_cat_id uuid;
  v_list_id uuid;
  v_dupe boolean;
begin
  select * into v_link from public.links where id = p_link_id and user_id = v_uid for update;
  if not found then
    raise exception 'link not found' using errcode = 'P0002';
  end if;
  if v_link.status <> 'done' or exists (select 1 from public.items where link_id = p_link_id) then
    raise exception 'this link is not waiting to be sorted' using errcode = '55000';
  end if;
  if length(v_name) not between 1 and 200 then
    raise exception 'name must be 1 to 200 characters' using errcode = '22023';
  end if;
  if p_kind = 'recipes' then
    v_cat_name := 'Recipes';
    v_list_name := public.recipe_group(array[v_name, v_link.raw_content->>'caption'], 'Saved posts');
  elsif p_kind = 'shop' then
    select g[1], g[2] into v_cat_name, v_list_name from public.shop_group(array[v_name, v_link.raw_content->>'caption']) g;
  else
    v_cat_name := 'Saved posts';
    v_list_name := case v_link.platform when 'tiktok' then 'TikTok' else 'Instagram' end;
  end if;

  select id into v_cat_id from public.categories
    where user_id = v_uid and kind = p_kind and lower(name) = lower(v_cat_name) limit 1;
  if v_cat_id is null then
    insert into public.categories (user_id, kind, name) values (v_uid, p_kind, v_cat_name) returning id into v_cat_id;
  end if;
  select id into v_list_id from public.lists
    where category_id = v_cat_id and lower(name) = lower(v_list_name) limit 1;
  if v_list_id is null then
    insert into public.lists (user_id, category_id, name) values (v_uid, v_cat_id, v_list_name) returning id into v_list_id;
  end if;

  v_dupe := exists (select 1 from public.items where list_id = v_list_id and lower(name) = lower(v_name));
  if not v_dupe then
    insert into public.items (user_id, list_id, link_id, name, description)
      values (v_uid, v_list_id, p_link_id, v_name, left(coalesce(v_link.raw_content->>'caption', ''), 2000));
  end if;

  update public.links set
    dismissed_at = null,
    raw_content = (coalesce(raw_content, '{}'::jsonb) - 'unsorted') || jsonb_build_object(
      'list_id', v_list_id,
      'already_listed', case when v_dupe then jsonb_build_array(v_name) else '[]'::jsonb end
    )
    where id = p_link_id;
  return v_list_id;
end $$;

revoke execute on function public.file_link(uuid, public.list_kind, text) from public, anon;
grant execute on function public.file_link(uuid, public.list_kind, text) to authenticated;

-- choose_link_kind (HAN-87), as in 20261123200000_recipe_groups.sql, except that moving a post to Shop files it in
-- Shop › <category> › <group>, read the same way as Recipes.
create or replace function public.choose_link_kind(p_link_id uuid, p_kind public.list_kind) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_raw jsonb;
  v_alt public.list_kind;
  v_from public.lists;
  v_from_cat public.categories;
  v_cat_name text;
  v_list_name text;
  v_cat_id uuid;
  v_list_id uuid;
  v_dupes text[];
begin
  select raw_content into v_raw from public.links where id = p_link_id and user_id = v_uid for update;
  if not found then
    raise exception 'link not found' using errcode = 'P0002';
  end if;
  select * into v_from from public.lists where id = (v_raw->>'list_id')::uuid and user_id = v_uid;
  select * into v_from_cat from public.categories where id = v_from.category_id;
  -- Nothing to choose (already answered, never ambiguous, or an alt_kind this database doesn't know): no-op.
  if v_raw->>'alt_kind' is null or v_from.id is null
     or not (v_raw->>'alt_kind' = any (enum_range(null::public.list_kind)::text[])) then
    return v_from.id;
  end if;
  v_alt := (v_raw->>'alt_kind')::public.list_kind;
  if p_kind is distinct from v_from_cat.kind and p_kind is distinct from v_alt then
    raise exception 'kind % was not offered for this link', p_kind using errcode = '22023';
  end if;

  if p_kind = v_from_cat.kind then
    update public.links set raw_content = raw_content - 'alt_kind' where id = p_link_id;
    return v_from.id;
  end if;

  if p_kind = 'recipes' then
    v_cat_name := 'Recipes';
    v_list_name := public.recipe_group(array[v_from.name, v_from_cat.name]
      || array(select name from public.items where link_id = p_link_id and list_id = v_from.id order by created_at, name)
      || v_from.tags);
  elsif p_kind = 'shop' then
    select g[1], g[2] into v_cat_name, v_list_name from public.shop_group(array[v_from.name, v_from_cat.name]
      || array(select name from public.items where link_id = p_link_id and list_id = v_from.id order by created_at, name)
      || v_from.tags) g;
  else
    v_cat_name := v_from_cat.name;
    v_list_name := v_from.name;
  end if;

  select id into v_cat_id from public.categories
    where user_id = v_uid and kind = p_kind and lower(name) = lower(v_cat_name) limit 1;
  if v_cat_id is null then
    insert into public.categories (user_id, kind, name) values (v_uid, p_kind, v_cat_name) returning id into v_cat_id;
  end if;
  select id into v_list_id from public.lists
    where category_id = v_cat_id and lower(name) = lower(v_list_name) limit 1;

  if v_list_id is null and not exists (
    select 1 from public.items where list_id = v_from.id and link_id is distinct from p_link_id
  ) then
    update public.lists set category_id = v_cat_id, name = v_list_name where id = v_from.id;
    v_list_id := v_from.id;
  else
    if v_list_id is null then
      insert into public.lists (user_id, category_id, name, tags) values (v_uid, v_cat_id, v_list_name, v_from.tags)
        returning id into v_list_id;
    else
      update public.lists set tags = array(
        select t from unnest(tags || v_from.tags) with ordinality u (t, n) group by t order by min(n)
      ) where id = v_list_id;
    end if;
    -- Items the other list already has stay as they are; this post's copies are dropped, as process-link does.
    with d as (
      delete from public.items i
        where i.link_id = p_link_id and i.list_id = v_from.id
          and exists (select 1 from public.items t where t.list_id = v_list_id and lower(t.name) = lower(i.name))
        returning i.name
    )
    select coalesce(array_agg(name), '{}') into v_dupes from d;
    update public.items set list_id = v_list_id where link_id = p_link_id and list_id = v_from.id;
  end if;

  if v_from_cat.kind in ('eats', 'travel', 'do') and p_kind not in ('eats', 'travel', 'do') then
    update public.items i set
      address = case when v_raw->'item_sources'->i.name->>'address' in ('places_lookup', 'search') then null else i.address end,
      lat = case when v_raw->'item_sources'->i.name->>'lat' = 'places_lookup' then null else i.lat end,
      lng = case when v_raw->'item_sources'->i.name->>'lat' = 'places_lookup' then null else i.lng end
      where i.link_id = p_link_id and i.list_id = v_list_id;
  end if;

  if v_list_id <> v_from.id and not exists (select 1 from public.items where list_id = v_from.id) then
    delete from public.lists where id = v_from.id;
  end if;
  if not exists (select 1 from public.lists where category_id = v_from_cat.id) then
    delete from public.categories where id = v_from_cat.id;
  end if;

  update public.links set raw_content = (raw_content - 'alt_kind') || jsonb_build_object(
    'list_id', v_list_id,
    'already_listed', coalesce(raw_content->'already_listed', '[]'::jsonb) || to_jsonb(coalesce(v_dupes, '{}'))
  ) where id = p_link_id;
  return v_list_id;
end $$;

revoke execute on function public.choose_link_kind(uuid, public.list_kind) from public, anon;
grant execute on function public.choose_link_kind(uuid, public.list_kind) to authenticated;

-- Regroup the products already saved. Each item goes to Shop › <category> › <group>, read from its list name, category
-- name, item name and the list's tags; items under Saved posts are read from their list name (unless it is just
-- Instagram or TikTok), name and caption instead. A list is moved and renamed rather than replaced when it is the only
-- one heading to its group, so a shared list keeps its share link. An item whose name the group already has stays put.
do $$
declare
  r record;
  mv record;
  v_cat_id uuid;
  v_list_id uuid;
begin
  create temp table shop_moves on commit drop as
    select i.id as item_id, i.name as item_name, i.user_id, l.id as list_id, l.tags, c.id as category_id, g[1] as cat, g[2] as grp
    from public.items i
    join public.lists l on l.id = i.list_id
    join public.categories c on c.id = l.category_id
    cross join lateral (select case when lower(c.name) = 'saved posts'
        then public.shop_group(array[case when lower(l.name) in ('instagram', 'tiktok') then null else l.name end,
          i.name, i.description])
        else public.shop_group(array[l.name, c.name, i.name] || l.tags)
      end) s (g)
    where c.kind = 'shop';

  for r in select distinct user_id, cat, grp from shop_moves order by user_id, cat, grp loop
    select id into v_cat_id from public.categories
      where user_id = r.user_id and kind = 'shop' and lower(name) = lower(r.cat) order by created_at limit 1;
    if v_cat_id is null then
      insert into public.categories (user_id, kind, name) values (r.user_id, 'shop', r.cat) returning id into v_cat_id;
    end if;

    select id into v_list_id from public.lists where category_id = v_cat_id and lower(name) = lower(r.grp) limit 1;
    if v_list_id is null then
      -- Reuse a Shop list whose items all head to this group, preferring a shared one, then the fullest.
      select l.id into v_list_id from public.lists l
        where exists (select 1 from shop_moves m where m.list_id = l.id)
          and not exists (select 1 from shop_moves m where m.list_id = l.id and (m.cat, m.grp) <> (r.cat, r.grp))
          and l.user_id = r.user_id
        order by exists (select 1 from public.list_shares s where s.list_id = l.id) desc,
          (select count(*) from shop_moves m where m.list_id = l.id) desc, l.created_at
        limit 1;
      if v_list_id is not null then
        update public.lists set category_id = v_cat_id, name = r.grp where id = v_list_id;
      else
        insert into public.lists (user_id, category_id, name) values (r.user_id, v_cat_id, r.grp) returning id into v_list_id;
      end if;
    end if;

    -- Moved one at a time so two items of the same name heading to the same group keep one and leave the other.
    for mv in select x.item_id, x.item_name, x.tags from shop_moves x
        where x.user_id = r.user_id and x.cat = r.cat and x.grp = r.grp and x.list_id <> v_list_id order by x.item_id loop
      if not exists (select 1 from public.items where list_id = v_list_id and lower(name) = lower(mv.item_name)) then
        update public.items set list_id = v_list_id where id = mv.item_id;
        update public.lists set tags = array(
          select t from unnest(tags || mv.tags) with ordinality u (t, n) group by t order by min(n)
        ) where id = v_list_id;
      end if;
    end loop;
  end loop;

  -- Lists and categories this emptied go; anything else is left alone.
  delete from public.lists l
    where l.id in (select list_id from shop_moves) and not exists (select 1 from public.items where list_id = l.id);
  delete from public.categories c
    where c.id in (select category_id from shop_moves) and not exists (select 1 from public.lists where category_id = c.id);

  -- Posts that pointed at a list that is gone point at the group its items went to.
  update public.links k set raw_content = k.raw_content || jsonb_build_object('list_id', d.dest)
    from (select distinct on (x.list_id) x.list_id as old, i.list_id as dest
          from shop_moves x join public.items i on i.id = x.item_id
          where i.list_id <> x.list_id order by x.list_id, x.item_id) d
    where k.raw_content->>'list_id' = d.old::text and not exists (select 1 from public.lists where id = d.old);
end $$;
