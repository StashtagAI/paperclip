-- HAN-125: shared lists are collaborative. A list shared with someone shows up in their stash under its kind and
-- category (Recipes › Dinners), live rather than copied, and they can add their own items to it and remove items from
-- it. The list stays the owner's: items a friend adds are stored as the owner's rows, so the owner sees them like any
-- other item.
--
-- The tables' row-level security is unchanged. Friends read and change a shared list only through the functions below,
-- so the owner's notes, ratings, photos, done marks and posts stay private, and the friend's Home, search, nudges and
-- list of stashes still hold only their own things.

-- 1. The lists shared with the caller. Internal: called by the security definer functions below, never by clients.
create or replace function public.shared_list_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.list_id
  from public.list_shares s
  join public.list_share_recipients r on r.token = s.token
  where r.user_id = (select auth.uid());
$$;

revoke execute on function public.shared_list_ids() from public, anon, authenticated;

-- 2. get_shared_with_me also returns the list id, so the app can file each shared list under its category and open it.
drop function public.get_shared_with_me();
create function public.get_shared_with_me()
returns table (
  token text,
  list_id uuid,
  kind public.list_kind,
  category text,
  list text,
  shared_by text,
  item_count int,
  shared_at timestamptz,
  seen_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    r.token,
    l.id,
    c.kind,
    c.name,
    l.name,
    p.display_name,
    (select count(*)::int from public.items i where i.list_id = l.id),
    r.created_at,
    r.seen_at
  from public.list_share_recipients r
  join public.list_shares s on s.token = r.token
  join public.lists l on l.id = s.list_id
  join public.categories c on c.id = l.category_id
  left join public.profiles p on p.user_id = s.user_id
  where r.user_id = (select auth.uid())
  order by r.created_at desc, r.token;
$$;

revoke execute on function public.get_shared_with_me() from public, anon;
grant execute on function public.get_shared_with_me() to authenticated;

-- 3. get_shared_list (the /s/<token> link) also says which list it is and whether it's the caller's own, so the app can
-- open the list itself. Same access check as HAN-68.
create or replace function public.get_shared_list(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'list_id', l.id,
    'own', l.user_id = (select auth.uid()),
    'kind', c.kind,
    'category', c.name,
    'list', l.name,
    'tags', l.tags,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', i.name,
        'description', i.description,
        'address', i.address,
        'lat', i.lat,
        'lng', i.lng,
        'tags', i.tags,
        'source_url', k.url,
        'platform', k.platform
      ) order by i.name)
      from public.items i left join public.links k on k.id = i.link_id
      where i.list_id = l.id
    ), '[]'::jsonb)
  )
  from public.list_shares s
  join public.lists l on l.id = s.list_id
  join public.categories c on c.id = l.category_id
  where s.token = p_token
    and (
      s.user_id = (select auth.uid())
      or exists (select 1 from public.list_share_recipients r where r.token = s.token and r.user_id = (select auth.uid()))
    );
$$;

-- 4. A list shared with the caller, as they see it: names, descriptions, addresses, pins, tags and source posts, plus
-- each item's id so they can open its recipe or remove it. Null when it isn't shared with them (including their own
-- lists, which the app reads directly).
create or replace function public.get_collab_list(p_list_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'list_id', l.id,
    'kind', c.kind,
    'category', c.name,
    'list', l.name,
    'tags', l.tags,
    'shared_by', p.display_name,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'description', i.description,
        'address', i.address,
        'lat', i.lat,
        'lng', i.lng,
        'tags', i.tags,
        'source_url', k.url,
        'platform', k.platform
      ) order by i.name)
      from public.items i left join public.links k on k.id = i.link_id
      where i.list_id = l.id
    ), '[]'::jsonb)
  )
  from public.lists l
  join public.categories c on c.id = l.category_id
  left join public.profiles p on p.user_id = l.user_id
  where l.id = p_list_id
    and l.id in (select public.shared_list_ids());
$$;

revoke execute on function public.get_collab_list(uuid) from public, anon;
grant execute on function public.get_collab_list(uuid) to authenticated;

-- 5. Recipes with the ingredients and steps process-link read from their posts (HAN-74), for the caller's own items and
-- items in lists shared with them, so Recipe and the shopping list work on a shared list too. link_id (for "Source
-- post") only when the post is the caller's own. Ids the caller can't see are left out.
create or replace function public.get_recipes(p_item_ids uuid[]) returns table (
  id uuid,
  name text,
  description text,
  link_id uuid,
  list_id uuid,
  list_name text,
  recipe_details jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    i.id,
    i.name,
    i.description,
    case when k.user_id = (select auth.uid()) then k.id end,
    l.id,
    l.name,
    k.raw_content->'recipe_details'->i.name
  from public.items i
  join public.lists l on l.id = i.list_id
  left join public.links k on k.id = i.link_id
  where i.id = any (coalesce(p_item_ids, '{}'))
    and (i.user_id = (select auth.uid()) or i.list_id in (select public.shared_list_ids()));
$$;

revoke execute on function public.get_recipes(uuid[]) from public, anon;
grant execute on function public.get_recipes(uuid[]) to authenticated;

-- 6. Copies some of the caller's own items into a list they own or that is shared with them. Only items of the same
-- kind (a recipe into a recipe list); an item whose name is already in the list (any case) is skipped. The copy keeps
-- the name, description, address, pin and tags, never the note, rating, photos or done mark.
-- Copies into someone else's list belong to the list's owner. Each keeps its source post the way add_shared_list does:
-- the owner gets a 'done' link row for the post URL (or reuses one they have), carrying the item's recipe details and
-- field sources, so Recipe and "From the post" work for them. Returns {added, skipped}.
create or replace function public.add_items_to_list(p_list_id uuid, p_item_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  dst public.lists;
  dst_kind public.list_kind;
  added int := 0;
  skipped int := 0;
  n int;
  it record;
  dst_link uuid;
  new_item uuid;
  extra jsonb;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_item_ids), 0) = 0 then
    return jsonb_build_object('added', 0, 'skipped', 0);
  end if;
  if cardinality(p_item_ids) > 200 then
    raise exception 'Add up to 200 at a time.' using errcode = '54000';
  end if;

  select l.* into dst from public.lists l
    where l.id = p_list_id and (l.user_id = uid or l.id in (select public.shared_list_ids()))
    for update;
  if not found then
    raise exception 'list not found' using errcode = 'P0002';
  end if;
  select kind into dst_kind from public.categories where id = dst.category_id;

  for it in
    select i.*, k.url as src_url, k.platform as src_platform, k.tags as src_tags,
      k.raw_content->'recipe_details'->i.name as src_recipe, k.raw_content->'item_sources'->i.name as src_sources
    from public.items i
    join public.lists l on l.id = i.list_id
    join public.categories c on c.id = l.category_id
    left join public.links k on k.id = i.link_id
    where i.id = any (p_item_ids) and i.user_id = uid and c.kind = dst_kind and i.list_id <> dst.id
    order by i.name
  loop
    if exists (select 1 from public.items where list_id = dst.id and lower(name) = lower(it.name)) then
      skipped := skipped + 1;
      continue;
    end if;

    dst_link := null;
    if dst.user_id = uid then
      dst_link := it.link_id;
    elsif it.src_url is not null then
      extra := jsonb_strip_nulls(jsonb_build_object(
        'recipe_details', case when it.src_recipe is not null then jsonb_build_object(it.name, it.src_recipe) end,
        'item_sources', case when it.src_sources is not null then jsonb_build_object(it.name, it.src_sources) end
      ));
      select id into dst_link from public.links where user_id = dst.user_id and url = it.src_url;
      if dst_link is null then
        insert into public.links (user_id, url, platform, status, tags, raw_content, processed_at)
          values (dst.user_id, it.src_url, it.src_platform, 'done', it.src_tags,
                  jsonb_build_object('source', 'shared_list') || extra, now())
          returning id into dst_link;
      elsif extra <> '{}'::jsonb then
        -- The owner already saved this post: add this item's details where they have none under its name.
        update public.links k set raw_content = coalesce(k.raw_content, '{}'::jsonb)
          || case when it.src_recipe is not null and k.raw_content->'recipe_details'->it.name is null
               then jsonb_build_object('recipe_details', coalesce(k.raw_content->'recipe_details', '{}'::jsonb)
                                         || jsonb_build_object(it.name, it.src_recipe))
               else '{}'::jsonb end
          || case when it.src_sources is not null and k.raw_content->'item_sources'->it.name is null
               then jsonb_build_object('item_sources', coalesce(k.raw_content->'item_sources', '{}'::jsonb)
                                         || jsonb_build_object(it.name, it.src_sources))
               else '{}'::jsonb end
          where k.id = dst_link;
      end if;
    end if;

    new_item := null;
    insert into public.items (user_id, list_id, link_id, name, description, address, lat, lng, tags,
                              google_place_id, google_rating, google_rating_count, opening_hours, google_checked_at)
      values (dst.user_id, dst.id, dst_link, it.name, it.description, it.address, it.lat, it.lng, it.tags,
              it.google_place_id, it.google_rating, it.google_rating_count, it.opening_hours, it.google_checked_at)
      on conflict (list_id, name) do nothing
      returning id into new_item;
    get diagnostics n = row_count;
    if n = 0 then
      skipped := skipped + 1;
      continue;
    end if;
    added := added + 1;
    if dst_link is not null then
      insert into public.item_posts (item_id, link_id, user_id) values (new_item, dst_link, dst.user_id)
        on conflict do nothing;
    end if;
  end loop;

  update public.lists set updated_at = now() where id = dst.id;
  return jsonb_build_object('added', added, 'skipped', skipped);
end $$;

revoke execute on function public.add_items_to_list(uuid, uuid[]) from public, anon;
grant execute on function public.add_items_to_list(uuid, uuid[]) to authenticated;

-- 7. Removes an item from a list shared with the caller (the owner deletes their own items directly). Gone for
-- everyone. A post link add_items_to_list or add_shared_list made only for that item goes too, so it doesn't turn up
-- in the owner's stash as "not sorted". The item's photo rows go with it; their files are cleared with the owner's
-- account (HAN-34).
create or replace function public.remove_shared_item(p_item_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gone public.items;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  delete from public.items
    where id = p_item_id and list_id in (select public.shared_list_ids())
    returning * into gone;
  if not found then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  delete from public.links k
    where k.id = gone.link_id
      and k.raw_content->>'source' = 'shared_list'
      and not exists (select 1 from public.items i where i.link_id = k.id)
      and not exists (select 1 from public.item_posts p where p.link_id = k.id);
  update public.lists set updated_at = now() where id = gone.list_id;
end $$;

revoke execute on function public.remove_shared_item(uuid) from public, anon;
grant execute on function public.remove_shared_item(uuid) to authenticated;

-- 8. A post link made for a shared item is never "not sorted" (HAN-89): if its item is deleted, there's nothing for the
-- user to file. Same view otherwise.
create or replace view public.link_overview with (security_invoker = true) as
select
  l.id, l.url, l.platform, l.status, l.error, l.tags, l.created_at, l.dismissed_at,
  l.raw_content->>'caption' as caption,
  l.raw_content->'fetch'->>'reason' as fetch_reason,
  (
    l.status = 'done'
    and not exists (select 1 from public.items i where i.link_id = l.id)
    and coalesce(l.raw_content->'already_listed', '[]'::jsonb) = '[]'::jsonb
    and coalesce(l.raw_content->>'source', '') <> 'shared_list'
  ) as not_sorted
from public.links l;
