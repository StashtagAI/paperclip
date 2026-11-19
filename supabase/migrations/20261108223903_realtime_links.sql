-- HAN-7: the app subscribes to changes on its own links rows to show live status (pending > processing > done/failed).
-- Realtime postgres_changes applies the existing "own links" RLS policy, so a user only receives their own rows.
alter publication supabase_realtime add table public.links;
