-- HAN-124: move items into another of the user's lists, picked from the lists they already have (the app no longer lets
-- them type a category and list, which created misspelt duplicates and failed on names that were taken).
--   p_item_ids : the items to move: one card, or every item on a list ("move this list").
--   p_list_id  : the list they go to. It must be the user's and under the same kind as every item.
-- An item whose name the list already has is merged into that copy rather than failing on unique (list_id, name): the
-- copy keeps the posts that recommended either, the earliest Done and favourite, a rating, and both notes. The copy with
-- photos is the one kept (photo files are stored under their item's id); if both have photos the item stays where it is.
-- Lists and categories this empties are deleted, and posts that pointed at one point at p_list_id instead.
-- Returns {"moved": n, "merged": n, "skipped": n}.
-- security definer because clients can't update links (raw_content.list_id belongs to process-link); every row it
-- touches is checked against auth.uid() first.
create or replace function public.move_items(p_item_ids uuid[], p_list_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_kind public.list_kind;
  v_from_lists uuid[];
  v_from_cats uuid[];
  v_moved int := 0;
  v_merged int := 0;
  v_skipped int := 0;
  r public.items;
  v_dup public.items;
  v_keep public.items;
  v_drop public.items;
  v_note text;
begin
  select c.kind into v_kind from public.lists l join public.categories c on c.id = l.category_id
    where l.id = p_list_id and l.user_id = v_uid for update of l;
  if not found then
    raise exception 'list not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from unnest(p_item_ids) x (id)
      left join public.items i on i.id = x.id and i.user_id = v_uid
      where i.id is null
  ) then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.items i join public.lists l on l.id = i.list_id join public.categories c on c.id = l.category_id
      where i.id = any (p_item_ids) and c.kind <> v_kind
  ) then
    raise exception 'items can only move to a list of the same kind' using errcode = '22023';
  end if;

  select array_agg(distinct i.list_id), array_agg(distinct l.category_id) into v_from_lists, v_from_cats
    from public.items i join public.lists l on l.id = i.list_id
    where i.id = any (p_item_ids) and i.list_id <> p_list_id;

  for r in select * from public.items where id = any (p_item_ids) and list_id <> p_list_id order by name, id for update loop
    select * into v_dup from public.items where list_id = p_list_id and lower(name) = lower(r.name) limit 1;
    if v_dup.id is null then
      update public.items set list_id = p_list_id where id = r.id;
      v_moved := v_moved + 1;
    elsif exists (select 1 from public.item_photos where item_id = r.id)
          and exists (select 1 from public.item_photos where item_id = v_dup.id) then
      v_skipped := v_skipped + 1;
    else
      if exists (select 1 from public.item_photos where item_id = r.id) then
        v_keep := r; v_drop := v_dup;
      else
        v_keep := v_dup; v_drop := r;
      end if;
      v_note := case
        when v_keep.note = '' then v_drop.note
        when v_drop.note = '' or v_drop.note = v_keep.note then v_keep.note
        else left(v_keep.note || E'\n\n' || v_drop.note, 4000)
      end;
      insert into public.item_posts (item_id, link_id, user_id)
        select v_keep.id, link_id, user_id from public.item_posts where item_id = v_drop.id
        on conflict do nothing;
      delete from public.items where id = v_drop.id;
      update public.items set
        list_id = p_list_id,
        note = v_note,
        rating = coalesce(v_keep.rating, v_drop.rating),
        done_at = least(v_keep.done_at, v_drop.done_at),
        favorited_at = least(v_keep.favorited_at, v_drop.favorited_at),
        tags = array(select t from unnest(v_keep.tags || v_drop.tags) with ordinality u (t, n) group by t order by min(n))
        where id = v_keep.id;
      v_merged := v_merged + 1;
    end if;
    -- The post's card follows the item when none of that post's items are left on the list it pointed at.
    update public.links k set raw_content = k.raw_content || jsonb_build_object('list_id', p_list_id)
      where k.id = r.link_id and k.user_id = v_uid and k.raw_content->>'list_id' = r.list_id::text
        and not exists (select 1 from public.items i where i.link_id = k.id and i.list_id = r.list_id);
  end loop;

  delete from public.lists l
    where l.id = any (v_from_lists) and not exists (select 1 from public.items where list_id = l.id);
  delete from public.categories c
    where c.id = any (v_from_cats) and not exists (select 1 from public.lists where category_id = c.id);
  update public.links k set raw_content = k.raw_content || jsonb_build_object('list_id', p_list_id)
    where k.user_id = v_uid and k.raw_content->>'list_id' = any (v_from_lists::text[])
      and not exists (select 1 from public.lists where id::text = k.raw_content->>'list_id');

  return jsonb_build_object('moved', v_moved, 'merged', v_merged, 'skipped', v_skipped);
end $$;

revoke execute on function public.move_items(uuid[], uuid) from public, anon;
grant execute on function public.move_items(uuid[], uuid) to authenticated;
