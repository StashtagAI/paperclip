-- HAN-124: Recipes are filed as Recipes › <meal> (Breakfast, Lunch, Dinner, Snacks, Desserts, Drinks) instead of one
-- category or list per post. process-link does this for new posts (recipe-groups.ts); this migration adds the same
-- rule in SQL for file_link and choose_link_kind, and regroups the recipes already saved.

-- The meal group the first text that mentions one points to, else p_fallback. Same table, same order, as
-- supabase/functions/process-link/recipe-groups.ts; keep the two in step.
create or replace function public.recipe_group(p_texts text[], p_fallback text default 'Dinner') returns text
language sql immutable set search_path = '' as $$
  select coalesce((
    select g.grp
      from unnest(p_texts) with ordinality t (txt, n)
      cross join (values
        (1, 'Breakfast', '\y(breakfast|brunch|oats|oatmeal|porridge|pancakes?|waffles?|granola|french toast|omelet(te)?s?)\y'),
        (2, 'Drinks', '\y(drinks?|cocktails?|mocktails?|smoothies?|lattes?|lemonade|juices?|chai|matcha|spritz|eggnog|hot chocolate)\y'),
        (3, 'Desserts', '\y(desserts?|cookies?|cakes?|cupcakes?|cheesecakes?|brownies?|fudge|candy|puddings?|mousse|ice cream|bark|truffles?|sweets?|treats?|chocolate)\y'),
        (4, 'Snacks', '\y(snacks?|appeti[sz]ers?|starters?|dips?|bites|finger food|game day)\y'),
        (5, 'Lunch', '\y(lunch(es)?|salads?|sandwich(es)?|wraps?)\y'),
        (6, 'Dinner', '\y(dinners?|suppers?|mains?|ramen|soups?|stews?|noodles?|pasta|curry|curries|rice)\y')
      ) g (ord, grp, re)
      where lower(t.txt) ~ g.re
      order by t.n, g.ord
      limit 1
  ), p_fallback);
$$;

revoke execute on function public.recipe_group(text[], text) from public, anon;
grant execute on function public.recipe_group(text[], text) to authenticated, service_role;

-- file_link (HAN-89), unchanged except that Recipes go to Recipes › <meal>, read from the name and caption; a post
-- that names no meal goes to Recipes › Saved posts.
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

-- choose_link_kind (HAN-87), unchanged except that moving a post to Recipes files it in Recipes › <meal>, read from
-- the list name, category name, this post's item names and the list's tags.
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

-- Regroup the recipes already saved. Each item goes to Recipes › <meal>, read from its list name, category name, item
-- name and the list's tags; items filed by hand under Saved posts are read from their name and caption instead.
-- A list already in Recipes is renamed to its meal rather than replaced when it is the only one heading there, so a
-- shared list keeps its share link. An item whose name the meal list already has stays where it was.
do $$
declare
  r record;
  mv record;
  v_cat_id uuid;
  v_list_id uuid;
begin
  create temp table recipe_moves on commit drop as
    select i.id as item_id, i.name as item_name, i.user_id, l.id as list_id, l.tags, c.id as category_id,
      case when lower(c.name) = 'saved posts'
        then public.recipe_group(array[i.name, i.description], 'Saved posts')
        else public.recipe_group(array[l.name, c.name, i.name] || l.tags)
      end as grp
    from public.items i
    join public.lists l on l.id = i.list_id
    join public.categories c on c.id = l.category_id
    where c.kind = 'recipes';

  for r in select distinct user_id, grp from recipe_moves order by user_id, grp loop
    select id into v_cat_id from public.categories
      where user_id = r.user_id and kind = 'recipes' and lower(name) = 'recipes' order by created_at limit 1;
    if v_cat_id is null then
      insert into public.categories (user_id, kind, name) values (r.user_id, 'recipes', 'Recipes') returning id into v_cat_id;
    end if;

    select id into v_list_id from public.lists where category_id = v_cat_id and lower(name) = lower(r.grp) limit 1;
    if v_list_id is null then
      -- Reuse a Recipes list whose items all head to this meal, preferring a shared one, then the fullest.
      select l.id into v_list_id from public.lists l
        where l.category_id = v_cat_id
          and not exists (select 1 from recipe_moves m where m.list_id = l.id and m.grp <> r.grp)
          and exists (select 1 from recipe_moves m where m.list_id = l.id)
        order by exists (select 1 from public.list_shares s where s.list_id = l.id) desc,
          (select count(*) from recipe_moves m where m.list_id = l.id) desc, l.created_at
        limit 1;
      if v_list_id is not null then
        update public.lists set name = r.grp where id = v_list_id;
      else
        insert into public.lists (user_id, category_id, name) values (r.user_id, v_cat_id, r.grp) returning id into v_list_id;
      end if;
    end if;

    -- Moved one at a time so two items of the same name heading to the same meal keep one and leave the other.
    for mv in select x.item_id, x.item_name, x.tags from recipe_moves x
        where x.user_id = r.user_id and x.grp = r.grp and x.list_id <> v_list_id order by x.item_id loop
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
    where l.id in (select list_id from recipe_moves) and not exists (select 1 from public.items where list_id = l.id);
  delete from public.categories c
    where c.id in (select category_id from recipe_moves) and not exists (select 1 from public.lists where category_id = c.id);

  -- Posts that pointed at a list that is gone point at the meal list its items went to.
  update public.links k set raw_content = k.raw_content || jsonb_build_object('list_id', d.dest)
    from (select distinct on (x.list_id) x.list_id as old, i.list_id as dest
          from recipe_moves x join public.items i on i.id = x.item_id
          where i.list_id <> x.list_id order by x.list_id, x.item_id) d
    where k.raw_content->>'list_id' = d.old::text and not exists (select 1 from public.lists where id = d.old);
end $$;
