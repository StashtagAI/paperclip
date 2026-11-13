-- HAN-44: an item can be recommended by several posts. item_posts holds one row per (item, post); the count of rows is
-- the "Recommended in N posts" number. items.link_id stays as the first post (the "Source post" link).
create table public.item_posts (
  item_id uuid not null references public.items (id) on delete cascade,
  link_id uuid not null references public.links (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, link_id)
);
create index item_posts_link_idx on public.item_posts (link_id);

alter table public.item_posts enable row level security;
-- Read-only for clients; process-link writes with the service role, delete_link through cascades.
create policy "own item posts" on public.item_posts
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Every existing item came from exactly one post.
insert into public.item_posts (item_id, link_id, user_id)
  select id, link_id, user_id from public.items where link_id is not null
  on conflict do nothing;

-- Delete a stash: items other posts also recommend stay (pointing at a remaining post); the rest go, along with
-- lists and categories they leave empty. Still security invoker, so a user only ever deletes their own rows.
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
    where i.link_id = p_link_id
       or i.id in (select item_id from public.item_posts where link_id = p_link_id);

  -- items another post also recommends: keep them, point their source at a remaining post
  update public.items i
    set link_id = (select p.link_id from public.item_posts p where p.item_id = i.id and p.link_id <> p_link_id
                   order by p.created_at, p.link_id limit 1)
    where i.link_id = p_link_id
      and exists (select 1 from public.item_posts p where p.item_id = i.id and p.link_id <> p_link_id);

  -- items only this post recommended
  delete from public.items i
    where (i.link_id = p_link_id or i.id in (select item_id from public.item_posts where link_id = p_link_id))
      and not exists (select 1 from public.item_posts p where p.item_id = i.id and p.link_id <> p_link_id);
  delete from public.links where id = p_link_id;  -- item_posts, process_events and link_feedback cascade

  delete from public.lists l
    where l.id = any(touched_lists) and not exists (select 1 from public.items i where i.list_id = l.id);
  delete from public.categories c
    where c.id = any(touched_cats) and not exists (select 1 from public.lists l where l.category_id = c.id);
end $$;

revoke execute on function public.delete_link(uuid) from public, anon;
grant execute on function public.delete_link(uuid) to authenticated;
