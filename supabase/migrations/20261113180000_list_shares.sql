-- HAN-50 (F3): share a list by link, and add a friend's shared list to your own stash.
-- A share is an unguessable token for one list. Anyone holding the token can read the list as it is now (names,
-- descriptions, addresses, pins, tags and source post URLs; never the owner's account or other lists). "Stop sharing"
-- deletes the row, so the old link stops working; sharing again makes a new token.

create table public.list_shares (
  -- 122 random bits from a v4 UUID, as 32 hex characters.
  token text primary key default replace(gen_random_uuid()::text, '-', '') check (token ~ '^[0-9a-f]{32}$'),
  list_id uuid not null unique references public.lists (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.list_shares enable row level security;
-- Signed-out readers only ever go through get_shared_list.
revoke all on public.list_shares from anon;

create policy "own list shares" on public.list_shares
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.lists l where l.id = list_id and l.user_id = (select auth.uid()))
  );

-- The shared list for a token, or null. security definer: the reader isn't the owner and may be signed out.
create or replace function public.get_shared_list(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
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
  where s.token = p_token;
$$;

revoke execute on function public.get_shared_list(text) from public;
grant execute on function public.get_shared_list(text) to anon, authenticated;

-- Copies a shared list into the caller's stash: same kind, category and list names (matched case-insensitively, as
-- process-link does), items whose names are already in that list are skipped. Each item keeps its source post: the
-- caller gets their own 'done' link row for the post URL (or reuses one they already have), so "Source post" works.
-- security definer to read the owner's rows; every write is pinned to auth.uid().
create or replace function public.add_shared_list(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  src_list public.lists;
  src_cat public.categories;
  cat_id uuid;
  dst_list uuid;
  added int := 0;
  n int;
  it record;
  dst_link uuid;
begin
  if uid is null then
    raise exception 'sign in to add a shared list' using errcode = '42501';
  end if;

  select l.* into src_list from public.list_shares s join public.lists l on l.id = s.list_id where s.token = p_token;
  if not found then
    raise exception 'shared list not found' using errcode = 'P0002';
  end if;
  if src_list.user_id = uid then
    return jsonb_build_object('list_id', src_list.id, 'added', 0, 'own', true);
  end if;
  select * into src_cat from public.categories where id = src_list.category_id;

  select id into cat_id from public.categories
    where user_id = uid and kind = src_cat.kind and lower(name) = lower(src_cat.name)
    order by created_at limit 1;
  if cat_id is null then
    insert into public.categories (user_id, kind, name) values (uid, src_cat.kind, src_cat.name) returning id into cat_id;
  end if;

  select id into dst_list from public.lists
    where user_id = uid and category_id = cat_id and lower(name) = lower(src_list.name)
    order by created_at limit 1;
  if dst_list is null then
    insert into public.lists (user_id, category_id, name, tags)
      values (uid, cat_id, src_list.name, src_list.tags) returning id into dst_list;
  end if;

  for it in
    select i.*, k.url as src_url, k.platform as src_platform, k.tags as src_tags
    from public.items i left join public.links k on k.id = i.link_id
    where i.list_id = src_list.id
    order by i.name
  loop
    if exists (select 1 from public.items where list_id = dst_list and lower(name) = lower(it.name)) then
      continue;
    end if;

    dst_link := null;
    if it.src_url is not null then
      select id into dst_link from public.links where user_id = uid and url = it.src_url;
      if dst_link is null then
        insert into public.links (user_id, url, platform, status, tags, raw_content, processed_at)
          values (uid, it.src_url, it.src_platform, 'done', it.src_tags, jsonb_build_object('source', 'shared_list'), now())
          returning id into dst_link;
      end if;
    end if;

    insert into public.items (user_id, list_id, link_id, name, description, address, lat, lng, tags)
      values (uid, dst_list, dst_link, it.name, it.description, it.address, it.lat, it.lng, it.tags)
      on conflict (list_id, name) do nothing;
    get diagnostics n = row_count;
    added := added + n;
  end loop;

  return jsonb_build_object('list_id', dst_list, 'added', added, 'own', false);
end $$;

revoke execute on function public.add_shared_list(text) from public, anon;
grant execute on function public.add_shared_list(text) to authenticated;
