-- HAN-63: CI-only stand-in for the Supabase Storage schema.
-- On a hosted/local Supabase project the Storage API service creates the storage schema at boot; the bare
-- supabase/postgres image used by scripts/test-db.sh does not, so migrations that touch storage.buckets/objects
-- (e.g. 20261113173441_item_notes_photos_ratings.sql) fail. Column names and storage.foldername mirror the real
-- definitions. scripts/test-db.sh applies this as supabase_admin (the image's storage schema is owned by it), only
-- when storage.buckets is missing. Never apply to a real project.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
  language plpgsql immutable
as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

-- Migrations run as postgres and create policies on storage.objects, which needs ownership.
alter table storage.buckets owner to postgres;
alter table storage.objects owner to postgres;
grant usage on schema storage to postgres, anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
