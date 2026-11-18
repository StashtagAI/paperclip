-- HAN-41: mark an item Visited / Tried / Cooked / Done, and show per-list progress ("3 of 8 tried").
-- Null means not done yet. The "own items" policy already lets a user update only their own items, and process-link
-- inserts with ignoreDuplicates, so re-stashing a post never clears a mark.
alter table public.items add column done_at timestamptz;
