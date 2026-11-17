-- HAN-66: place_lookups and search_lookups are server-only caches, read and written by process-link with the service
-- role. RLS with no policies already hides every row from clients; this also takes away the default table grants
-- Supabase gives anon and authenticated (TRUNCATE in particular ignores RLS), so the caches don't depend on RLS alone.
revoke all on public.place_lookups from anon, authenticated;
revoke all on public.search_lookups from anon, authenticated;
