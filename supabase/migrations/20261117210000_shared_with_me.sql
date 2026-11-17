-- HAN-71: a recipient sees the lists shared with them, and who shared each, without needing the link; the app shows a
-- popup once for each new one. Board request on HAN-68.

-- 1. When the recipient first saw the share in the app. Null means new. Removing a person or stopping the share deletes
-- the row, so adding them again makes it new again.
alter table public.list_share_recipients add column seen_at timestamptz;

-- 2. The name friends see when you share a list with them. Board decision on HAN-71: a name the owner sets, not their
-- account email. One row per account, read and written only by its owner; recipients see it only through
-- get_shared_with_me. Deleting the account deletes it.
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (
    display_name = btrim(display_name) and length(display_name) between 1 and 50 and display_name !~ '[[:cntrl:]]'
  ),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

create policy "owner reads profile" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "owner adds profile" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner updates profile" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 3. The caller's shared-with-me lists, newest first: list name, the owner's display name (null if they haven't set
-- one) and the item count. Nothing else of the owner's: no ids, email, notes, ratings or photos. security definer to
-- read the owner's list, category, items and name; rows are pinned to auth.uid().
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

-- 4. Marks the caller's own shares as seen; other users' rows and unknown tokens are ignored. Returns how many changed.
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
