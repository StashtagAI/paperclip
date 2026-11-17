-- HAN-71: a recipient sees the lists shared with them, and who shared each, without needing the link; the app shows a
-- popup once for each new one. Board request on HAN-68.

-- 1. When the recipient first saw the share in the app. Null means new. Removing a person or stopping the share deletes
-- the row, so adding them again makes it new again.
alter table public.list_share_recipients add column seen_at timestamptz;

-- 2. The caller's shared-with-me lists, newest first: list name, the owner's account email (the app has no display
-- names) and the item count. Nothing else of the owner's: no ids, notes, ratings or photos. security definer to read
-- the owner's list, category, items and email; rows are pinned to auth.uid().
create or replace function public.get_shared_with_me()
returns table (
  token text,
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
    c.kind,
    c.name,
    l.name,
    u.email::text,
    (select count(*)::int from public.items i where i.list_id = l.id),
    r.created_at,
    r.seen_at
  from public.list_share_recipients r
  join public.list_shares s on s.token = r.token
  join public.lists l on l.id = s.list_id
  join public.categories c on c.id = l.category_id
  join auth.users u on u.id = s.user_id
  where r.user_id = (select auth.uid())
  order by r.created_at desc, r.token;
$$;

revoke execute on function public.get_shared_with_me() from public, anon;
grant execute on function public.get_shared_with_me() to authenticated;

-- 3. Marks the caller's own shares as seen; other users' rows and unknown tokens are ignored. Returns how many changed.
-- security definer because the table still has no UPDATE grant: only seen_at changes, and only through here.
create or replace function public.mark_shares_seen(p_tokens text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  update public.list_share_recipients
    set seen_at = now()
    where user_id = auth.uid() and token = any (coalesce(p_tokens, '{}')) and seen_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.mark_shares_seen(text[]) from public, anon;
grant execute on function public.mark_shares_seen(text[]) to authenticated;
