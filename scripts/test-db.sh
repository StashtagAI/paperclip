#!/usr/bin/env bash
# HAN-46: apply supabase/migrations to an EMPTY Supabase Postgres and run the pgTAP tests in supabase/tests/database.
# Usage: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres scripts/test-db.sh
# Never point this at a real project: it applies every migration. Each test file rolls itself back.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to an empty Supabase Postgres (e.g. the public.ecr.aws/supabase/postgres image)}"

# HAN-63: the bare image has no storage tables (the Storage API service creates them), so stub them for the
# migrations. The image's storage schema belongs to supabase_admin (same password as postgres in the image).
ADMIN_DATABASE_URL="${ADMIN_DATABASE_URL:-${DATABASE_URL/:\/\/postgres:/:\/\/supabase_admin:}}"
if [ "$(psql "$DATABASE_URL" -X -At -c "select to_regclass('storage.buckets') is null")" = t ]; then
  psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/storage-stub.sql >/dev/null
fi

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
