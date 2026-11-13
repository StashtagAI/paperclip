-- HAN-45 (F6): the user's own note, star rating and photos on an item.
-- process-link only inserts items it hasn't seen, so it never overwrites these.

alter table public.items
  add column note text not null default '' check (length(note) <= 4000),
  add column rating smallint check (rating between 1 and 5);

-- One row per photo the user added. The file lives in the private item-photos bucket at
-- {user_id}/{item_id}/{file}; alt is required so every photo can be read out by VoiceOver/TalkBack.
create table public.item_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  path text not null unique,
  alt text not null check (length(trim(alt)) between 1 and 300),
  width integer check (width > 0),
  height integer check (height > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index item_photos_item_idx on public.item_photos (item_id, created_at);
create index item_photos_user_idx on public.item_photos (user_id);

create trigger item_photos_updated_at before update on public.item_photos
  for each row execute function public.set_updated_at();

alter table public.item_photos enable row level security;

create policy "own item photos" on public.item_photos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid()))
    and path like (select auth.uid())::text || '/' || item_id::text || '/%'
  );

-- Private bucket; files are shown through short-lived signed URLs. delete-account (HAN-34) removes every object under
-- the user's id prefix.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "item photos: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "item photos: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "item photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
