-- HAN-123: star an item as a favorite, and show a Favorites list under each kind (Eats, Recipes, Do, Travel).
-- Null means not a favorite. Like done_at, the "own items" policy already limits updates to the user's own items, and
-- process-link inserts with ignoreDuplicates, so re-stashing a post never clears a star. Shared-list copies name their
-- columns, so a friend's favorites never come across.
alter table public.items add column favorited_at timestamptz;
create index items_user_favorited_idx on public.items (user_id, favorited_at desc) where favorited_at is not null;
