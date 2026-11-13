#!/usr/bin/env bash
# HAN-46: apply supabase/migrations to an EMPTY Supabase Postgres and run the pgTAP tests in supabase/tests/database.
# Usage: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres scripts/test-db.sh
# Never point this at a real project: it applies every migration. Each test file rolls itself back.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to an empty Supabase Postgres (e.g. the public.ecr.aws/supabase/postgres image)}"

# The bare image has an empty storage schema (the Storage service fills it); stub the parts migrations reference.
# The schema belongs to supabase_admin, which shares the postgres password in the image.
ADMIN_DATABASE_URL="${ADMIN_DATABASE_URL:-${DATABASE_URL/\/\/postgres:/\/\/supabase_admin:}}"
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -q >/dev/null <<'SQL'
do $$
begin
  if to_regclass('storage.objects') is null then
    create table storage.buckets (id text primary key, name text not null, public boolean default false,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets,
      name text, owner uuid, owner_id text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $f$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $f$;
    alter table storage.buckets owner to postgres;
    alter table storage.objects owner to postgres;
    grant usage on schema storage to postgres, authenticated, anon;
  end if;
end $$;
SQL

for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done

status=0
for t in supabase/tests/database/*.test.sql; do
  echo "# $t"
  out=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -At -f "$t" 2>&1) || status=1
  echo "$out"
  if grep -qE '^not ok|^# Looks like|ERROR:' <<<"$out"; then status=1; fi
done
exit $status
