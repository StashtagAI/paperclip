-- HAN-40: users can edit an extracted item and report one that is wrong.
-- items.edited_at marks a user edit so the app can say "Edited by you" instead of implying the post said it.
-- item_reports feeds extraction QA: each row snapshots the item, its sources and the caption excerpt at report time,
-- and survives the item being removed.

alter table public.items add column edited_at timestamptz;

create type public.item_report_reason as enum (
  'not_in_post',     -- the post never mentions this
  'wrong_place',     -- right name, wrong address or map pin
  'wrong_category',  -- filed under the wrong kind, category or list
  'wrong_details',   -- name or description is wrong
  'duplicate',
  'other'
);

create table public.item_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid references public.items (id) on delete set null,
  link_id uuid references public.links (id) on delete set null,
  reason public.item_report_reason not null,
  note text check (length(note) <= 1000),
  removed boolean not null default false,  -- the user also removed the item from their list
  snapshot jsonb,                          -- filled by trigger; a client-supplied value is ignored
  created_at timestamptz not null default now(),
  unique (item_id, user_id)
);
create index item_reports_link_idx on public.item_reports (link_id);
alter table public.item_reports enable row level security;
create policy "own item reports select" on public.item_reports for select to authenticated using (user_id = (select auth.uid()));
create policy "own item reports insert" on public.item_reports for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid()))
);
create policy "own item reports update" on public.item_reports for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function public.item_report_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Deleting the item sets item_id to null, which fires this trigger again; keep the snapshot taken at report time.
  if tg_op = 'UPDATE' and new.item_id is null then
    new.snapshot := old.snapshot;
    new.link_id := old.link_id;
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
create trigger item_report_snapshot before insert or update on public.item_reports
  for each row execute function public.item_report_snapshot();
revoke execute on function public.item_report_snapshot() from public, anon, authenticated;
