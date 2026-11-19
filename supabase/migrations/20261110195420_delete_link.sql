-- HAN-20: delete a stash (a link and everything it added) in one transaction.
-- items.link_id is "on delete set null", so deleting only the link would leave its items behind. Lists and categories
-- the link's items were in are removed too once they're empty; ones still holding other posts' items are kept.
-- security invoker: runs under the caller's RLS, so a user can only ever delete their own rows.
create or replace function public.delete_link(p_link_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  touched_lists uuid[];
  touched_cats uuid[];
begin
  if not exists (select 1 from public.links where id = p_link_id) then
    raise exception 'link not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct i.list_id), '{}'), coalesce(array_agg(distinct l.category_id), '{}')
    into touched_lists, touched_cats
    from public.items i join public.lists l on l.id = i.list_id
    where i.link_id = p_link_id;

  delete from public.items where link_id = p_link_id;
  delete from public.links where id = p_link_id;  -- process_events and link_feedback cascade

  delete from public.lists l
    where l.id = any(touched_lists) and not exists (select 1 from public.items i where i.list_id = l.id);
  delete from public.categories c
    where c.id = any(touched_cats) and not exists (select 1 from public.lists l where l.category_id = c.id);
end $$;

revoke execute on function public.delete_link(uuid) from public, anon;
grant execute on function public.delete_link(uuid) to authenticated;
