-- HAN-55: the lookup caches are shared by every user, so a wrong entry planted through one user's caption would reach
-- others. Entries now record where they came from and process-link ignores ones older than 30 days (created_at is
-- refreshed on every write). Search entries are also keyed per user (query_key is prefixed with the user id).
alter table public.place_lookups add column if not exists source text not null default 'places_api';
alter table public.search_lookups add column if not exists source text not null default 'web_search';
alter table public.search_lookups add column if not exists user_id uuid references auth.users(id) on delete cascade;
-- Existing search entries are unscoped and cannot be attributed to a user: drop them, they are only a cache.
delete from public.search_lookups where user_id is null;
create index if not exists search_lookups_user_id_idx on public.search_lookups (user_id);
