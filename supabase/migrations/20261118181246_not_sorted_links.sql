-- HAN-89: a stash process-link finished ("done") without filing anything is "not sorted". It belongs to no list, so
-- the app keeps it on Home until the user files it under a kind (file_link) or dismisses it (dismiss_link).

-- When the user dismissed a not-sorted stash from Home. It stays on the card and in the full list of stashes.
alter table public.links add column dismissed_at timestamptz;

-- Every stash with what the app lists it by. security_invoker, so the links RLS policy still applies.
-- not_sorted: done, no item of this post in any list, and nothing skipped as already listed (those are filed).
create view public.link_overview with (security_invoker = true) as
select
  l.id, l.url, l.platform, l.status, l.error, l.tags, l.created_at, l.dismissed_at,
  l.raw_content->>'caption' as caption,
  l.raw_content->'fetch'->>'reason' as fetch_reason,
  (
    l.status = 'done'
    and not exists (select 1 from public.items i where i.link_id = l.id)
    and coalesce(l.raw_content->'already_listed', '[]'::jsonb) = '[]'::jsonb
  ) as not_sorted
from public.links l;

revoke all on public.link_overview from public, anon;
grant select on public.link_overview to authenticated;

-- Files a not-sorted stash by hand: one item named `p_name` (the card suggests the caption's first line), with the
-- caption as its description, in "Saved posts › Instagram" (or TikTok) under `p_kind`. Category and list are matched
-- case-insensitively, as process-link does, and created if missing. An item of that name already in the list is kept
-- and the name is recorded as already listed, as process-link does. Returns the list.
-- security definer because clients can't update links; every row it touches is checked against auth.uid() first.
create or replace function public.file_link(p_link_id uuid, p_kind public.list_kind, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_link public.links;
  v_name text := trim(coalesce(p_name, ''));
  v_list_name text;
  v_cat_id uuid;
  v_list_id uuid;
  v_dupe boolean;
begin
  select * into v_link from public.links where id = p_link_id and user_id = v_uid for update;
  if not found then
    raise exception 'link not found' using errcode = 'P0002';
  end if;
  if v_link.status <> 'done' or exists (select 1 from public.items where link_id = p_link_id) then
    raise exception 'this link is not waiting to be sorted' using errcode = '55000';
  end if;
  if length(v_name) not between 1 and 200 then
    raise exception 'name must be 1 to 200 characters' using errcode = '22023';
  end if;
  v_list_name := case v_link.platform when 'tiktok' then 'TikTok' else 'Instagram' end;

  select id into v_cat_id from public.categories
    where user_id = v_uid and kind = p_kind and lower(name) = 'saved posts' limit 1;
  if v_cat_id is null then
    insert into public.categories (user_id, kind, name) values (v_uid, p_kind, 'Saved posts') returning id into v_cat_id;
  end if;
  select id into v_list_id from public.lists
    where category_id = v_cat_id and lower(name) = lower(v_list_name) limit 1;
  if v_list_id is null then
    insert into public.lists (user_id, category_id, name) values (v_uid, v_cat_id, v_list_name) returning id into v_list_id;
  end if;

  v_dupe := exists (select 1 from public.items where list_id = v_list_id and lower(name) = lower(v_name));
  if not v_dupe then
    insert into public.items (user_id, list_id, link_id, name, description)
      values (v_uid, v_list_id, p_link_id, v_name, left(coalesce(v_link.raw_content->>'caption', ''), 2000));
  end if;

  update public.links set
    dismissed_at = null,
    raw_content = (coalesce(raw_content, '{}'::jsonb) - 'unsorted') || jsonb_build_object(
      'list_id', v_list_id,
      'already_listed', case when v_dupe then jsonb_build_array(v_name) else '[]'::jsonb end
    )
    where id = p_link_id;
  return v_list_id;
end $$;

revoke execute on function public.file_link(uuid, public.list_kind, text) from public, anon;
grant execute on function public.file_link(uuid, public.list_kind, text) to authenticated;

-- Takes a not-sorted stash off Home. It can still be filed from its card later, which clears this.
create or replace function public.dismiss_link(p_link_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.links set dismissed_at = now() where id = p_link_id and user_id = auth.uid();
  if not found then
    raise exception 'link not found' using errcode = 'P0002';
  end if;
end $$;

revoke execute on function public.dismiss_link(uuid) from public, anon;
grant execute on function public.dismiss_link(uuid) to authenticated;
