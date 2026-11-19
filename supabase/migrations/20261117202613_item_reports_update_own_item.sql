-- HAN-72: the update policy on item_reports only checked user_id, so a user could point their own report at another
-- user's item_id and read back the snapshot the security definer trigger builds from it (name, address, caption).
-- Updates must keep the report on one of the user's own items, like inserts. item_id may still become null: that is
-- the FK's "on delete set null" when the item is deleted, which keeps the old snapshot.
drop policy "own item reports update" on public.item_reports;
create policy "own item reports update" on public.item_reports for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (item_id is null or exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid())))
  );

-- HAN-72: once item_id is null the trigger put old.link_id back, so the FK's "on delete set null" for link_id was
-- undone and delete_link failed with 23503 for any link with a reported item. A null link_id now stays null; any other
-- change to link_id is still reverted.
create or replace function public.item_report_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.item_id is null then
    new.snapshot := old.snapshot;
    new.link_id := case when new.link_id is null then null else old.link_id end;
    return new;
  end if;
  new.snapshot := (
    select jsonb_build_object(
      'name', i.name,
      'description', i.description,
      'address', i.address,
      'lat', i.lat,
      'lng', i.lng,
      'edited', i.edited_at is not null,
      'list', li.name,
      'category', c.name,
      'kind', c.kind,
      'url', k.url,
      'status', k.status,
      'sources', k.raw_content -> 'item_sources' -> i.name,
      'source_urls', k.raw_content -> 'item_source_urls' -> i.name,
      'caption_source', k.raw_content ->> 'caption_source',
      'caption_excerpt', left(coalesce(k.raw_content ->> 'caption', ''), 1000))
    from public.items i
    join public.lists li on li.id = i.list_id
    join public.categories c on c.id = li.category_id
    left join public.links k on k.id = i.link_id
    where i.id = new.item_id);
  new.link_id := (select i.link_id from public.items i where i.id = new.item_id);
  return new;
end $$;
revoke execute on function public.item_report_snapshot() from public, anon, authenticated;
