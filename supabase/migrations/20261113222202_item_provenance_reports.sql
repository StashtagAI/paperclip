-- HAN-40: items the user edited by hand, and reports of wrong items (with a snapshot of what was extracted).
-- HAN-72: this is the SQL production applied as version 20261113222202 (copied from supabase_migrations.schema_migrations).
alter table public.items add column edited_at timestamptz;

create type public.item_report_reason as enum (
  'not_in_post',
  'wrong_place',
  'wrong_category',
  'wrong_details',
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
  removed boolean not null default false,
  snapshot jsonb,
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
