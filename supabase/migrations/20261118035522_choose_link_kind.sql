-- HAN-87: when process-link can't tell which kind a post belongs to it files it under `kind` and stores the runner-up in
-- links.raw_content.alt_kind (HAN-85). The card then asks the user. choose_link_kind records the answer:
--   p_kind = the kind it's filed under : keep it there; the question goes away.
--   p_kind = alt_kind                  : move this post's items to a category and list of the same names under that
--                                        kind (merged into existing ones, case-insensitively, like process-link).
-- Only this post's items move; a list that also holds other posts' items stays where it is. A list that holds only
-- this post's items is moved as it is (keeping its id) unless the other kind already has a list with that name.
-- Leaving a place kind (eats, travel, do) clears addresses and map pins that came from Places or web search, since
-- they were looked up for the wrong kind of thing; addresses from the post itself are kept.
-- Returns the list the post's items are in afterwards.
-- security definer because clients can't update links (status and results belong to process-link); every row it
-- touches is checked against auth.uid() first.
create or replace function public.choose_link_kind(p_link_id uuid, p_kind public.list_kind) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_raw jsonb;
  v_alt public.list_kind;
  v_from public.lists;
  v_from_cat public.categories;
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

  select id into v_cat_id from public.categories
    where user_id = v_uid and kind = p_kind and lower(name) = lower(v_from_cat.name) limit 1;
  if v_cat_id is null then
    insert into public.categories (user_id, kind, name) values (v_uid, p_kind, v_from_cat.name) returning id into v_cat_id;
  end if;
  select id into v_list_id from public.lists
    where category_id = v_cat_id and lower(name) = lower(v_from.name) limit 1;

  if v_list_id is null and not exists (
    select 1 from public.items where list_id = v_from.id and link_id is distinct from p_link_id
  ) then
    update public.lists set category_id = v_cat_id where id = v_from.id;
    v_list_id := v_from.id;
  else
    if v_list_id is null then
      insert into public.lists (user_id, category_id, name, tags) values (v_uid, v_cat_id, v_from.name, v_from.tags)
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
