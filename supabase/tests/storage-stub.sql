-- The bare supabase/postgres image has no storage schema: the Storage service creates it on a real project.
-- scripts/test-db.sh applies this first as supabase_admin (the schema's owner), only when storage.objects is missing, so
-- migrations that add buckets,
-- storage policies or read storage.objects can run. Only the columns and helpers our migrations use.
create schema if not exists storage;

create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

create function storage.foldername(name text) returns text[]
language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

-- Migrations run as postgres and add policies to storage.objects, which needs ownership.
alter table storage.buckets owner to postgres;
alter table storage.objects owner to postgres;
grant usage on schema storage to postgres, anon, authenticated, service_role;
