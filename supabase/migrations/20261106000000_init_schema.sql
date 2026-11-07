-- StashtagAI initial schema (HAN-5).
-- links -> (process-link) -> categories > lists > items, all owned by one auth user.
-- Column names match the process-link contract agreed on HAN-6:
--   categories upsert on (user_id, kind, name)
--   lists      upsert on (user_id, category_id, name)
--   items      upsert on (list_id, name)

create type public.link_platform as enum ('instagram', 'tiktok');
create type public.link_status as enum ('pending', 'processing', 'done', 'failed');
-- Fixed top level shown in the app (design brief HAN-9).
create type public.list_kind as enum ('eats', 'trips', 'recipes', 'do');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- links: one row per submitted Instagram/TikTok URL.
create table public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Defence in depth behind the client filter and process-link's own allowlist:
  -- exact host, https only, path must follow the host directly (no userinfo/port).
  url text not null check (
    length(url) <= 2048
    and url ~ '^https://((www\.)?instagram\.com|(www\.|m\.|vm\.)?tiktok\.com)/'
  ),
  platform public.link_platform not null,
  status public.link_status not null default 'pending',
  raw_content jsonb,          -- caption/author/transcript as retrieved by process-link
  tags text[] not null default '{}',
  error text,                 -- machine-readable failure code, set when status = 'failed'
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);
create index links_user_created_idx on public.links (user_id, created_at desc);
create index links_status_idx on public.links (status) where status in ('pending', 'processing');

-- categories: e.g. kind = 'eats', name = 'Restaurants'.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.list_kind not null,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, name)
);

-- lists: a scope inside a category, e.g. Restaurants > Denver.
-- name holds the list_scope from extraction (falls back to the category name).
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, name)
);
create index lists_category_idx on public.lists (category_id);

-- items: the places/recipes/things extracted from a post.
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id uuid not null references public.lists (id) on delete cascade,
  link_id uuid references public.links (id) on delete set null,  -- source post
  name text not null check (length(trim(name)) between 1 and 200),
  description text not null default '',
  address text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_id, name),
  check ((lat is null) = (lng is null))
);
create index items_list_idx on public.items (list_id);
create index items_link_idx on public.items (link_id);

create trigger links_updated_at before update on public.links
  for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger lists_updated_at before update on public.lists
  for each row execute function public.set_updated_at();
create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();

-- Row level security: a user only ever sees and writes their own rows.
-- process-link uses the service-role key, which bypasses RLS.
alter table public.links enable row level security;
alter table public.categories enable row level security;
alter table public.lists enable row level security;
alter table public.items enable row level security;

create policy "own links" on public.links
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Clients may only create links as 'pending'; status transitions belong to process-link.
create policy "insert pending links" on public.links
  as restrictive for insert to authenticated
  with check (status = 'pending' and error is null and raw_content is null);

create policy "own categories" on public.categories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own lists" on public.lists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid()))
  );

create policy "own items" on public.items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.lists l where l.id = list_id and l.user_id = (select auth.uid()))
    and (link_id is null or exists (select 1 from public.links k where k.id = link_id and k.user_id = (select auth.uid())))
  );

-- Clients can insert, read and delete their links but never rewrite status/results.
revoke update on public.links from anon, authenticated;
