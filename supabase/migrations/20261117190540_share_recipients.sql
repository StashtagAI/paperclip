-- HAN-68: a shared list opens only for the people the owner shared it with (board decision on HAN-66).
-- The owner adds friends by the email of their Stashtag account (board choice: existing accounts only). The owner is
-- told straight away when no account uses that email, so lookups are rate limited per owner. Recipients are stored by
-- account, so a friend who later changes their email keeps access; deleting either account or stopping the share
-- removes it.

-- 1. No signed-out access. /s/<token> asks people to sign in first and keeps the token across sign-in.
revoke execute on function public.get_shared_list(text) from public, anon;
grant execute on function public.get_shared_list(text) to authenticated;

-- 2. Who a share is for. Rows are added only through add_share_recipient (it checks the account exists); the owner
-- can read and remove them, a recipient can read only their own. Nobody updates: remove and add again.
create table public.list_share_recipients (
  token text not null references public.list_shares (token) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The address the owner typed, lowercased, so the share sheet can show who it's for.
  email text not null check (email = lower(email) and length(email) <= 254),
  created_at timestamptz not null default now(),
  primary key (token, user_id)
);

alter table public.list_share_recipients enable row level security;
revoke all on public.list_share_recipients from anon, authenticated;
grant select, delete on public.list_share_recipients to authenticated;

create policy "owner reads share recipients" on public.list_share_recipients
  for select to authenticated
  using (exists (select 1 from public.list_shares s where s.token = list_share_recipients.token and s.user_id = (select auth.uid())));
create policy "owner removes share recipients" on public.list_share_recipients
  for delete to authenticated
  using (exists (select 1 from public.list_shares s where s.token = list_share_recipients.token and s.user_id = (select auth.uid())));
create policy "recipient reads own row" on public.list_share_recipients
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Every add_share_recipient lookup, for the rate limit. Server-side only: no grants, no policies.
create table public.share_recipient_lookups (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index share_recipient_lookups_user_at on public.share_recipient_lookups (user_id, at);
alter table public.share_recipient_lookups enable row level security;
revoke all on public.share_recipient_lookups from anon, authenticated;

-- Adds the account with this (confirmed) email as a recipient of the caller's share. Returns {email} when added (or
-- already there), {error: 'no_account' | 'self'} otherwise. Those are returned rather than raised so the lookup still
-- counts towards the limit. At most 20 lookups an hour per owner and 50 recipients per share.
create or replace function public.add_share_recipient(p_token text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  addr text := lower(btrim(coalesce(p_email, '')));
  friend uuid;
begin
  if uid is null then
    raise exception 'sign in to share a list' using errcode = '42501';
  end if;
  -- Anonymous sessions are free to make, so each would be a fresh lookup budget. Reads the claims auth.jwt() reads.
  if coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign in to share a list' using errcode = '42501';
  end if;
  if not exists (select 1 from public.list_shares where token = p_token and user_id = uid) then
    raise exception 'shared list not found' using errcode = 'P0002';
  end if;
  if addr !~ '^[^@\s]+@[^@\s]+$' or length(addr) > 254 then
    raise exception 'Enter an email address, like name@example.com.' using errcode = '22023';
  end if;
  -- One owner's lookups run one at a time, so parallel calls can't all pass the count.
  perform pg_advisory_xact_lock(hashtextextended('share_recipient_lookups:' || uid::text, 0));
  delete from public.share_recipient_lookups where user_id = uid and at <= now() - interval '1 hour';
  if (select count(*) from public.share_recipient_lookups where user_id = uid and at > now() - interval '1 hour') >= 20 then
    raise exception 'You’ve added a lot of people in the last hour. Try again later.' using errcode = '54000';
  end if;
  if (select count(*) from public.list_share_recipients where token = p_token) >= 50 then
    raise exception 'A list can be shared with up to 50 people.' using errcode = '54000';
  end if;

  insert into public.share_recipient_lookups (user_id) values (uid);
  select id into friend from auth.users
    where lower(email) = addr and email_confirmed_at is not null and deleted_at is null
    limit 1;
  if friend is null then
    return jsonb_build_object('error', 'no_account');
  end if;
  if friend = uid then
    return jsonb_build_object('error', 'self');
  end if;
  insert into public.list_share_recipients (token, user_id, email) values (p_token, friend, addr)
    on conflict (token, user_id) do nothing;
  return jsonb_build_object('email', addr);
end $$;

revoke execute on function public.add_share_recipient(text, text) from public, anon;
grant execute on function public.add_share_recipient(text, text) to authenticated;

-- 3. Both share functions answer only the owner and the share's recipients. Anyone else gets what an unknown token
-- gets (null / "shared list not found"), so a forwarded link doesn't reveal that the list exists.
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
  where s.token = p_token
    and (
      s.user_id = (select auth.uid())
      or exists (select 1 from public.list_share_recipients r where r.token = s.token and r.user_id = (select auth.uid()))
    );
$$;

-- Same body as HAN-50 apart from the recipient check on the source list.
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

  select l.* into src_list from public.list_shares s join public.lists l on l.id = s.list_id
    where s.token = p_token
      and (
        s.user_id = uid
        or exists (select 1 from public.list_share_recipients r where r.token = s.token and r.user_id = uid)
      );
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
