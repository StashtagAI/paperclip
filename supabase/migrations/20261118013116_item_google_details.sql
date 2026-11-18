-- HAN-83: Google rating and opening hours for restaurants (Eats items). Filled in by the place-details function
-- (service role) when an Eats list is opened, and refreshed after a week so hours don't go stale. Not the same as
-- items.rating, which is the user's own 1–5 stars (HAN-45).
alter table public.items
  add column if not exists google_place_id text,
  add column if not exists google_rating real check (google_rating between 1 and 5),
  add column if not exists google_rating_count integer check (google_rating_count >= 0),
  -- {periods: [{open: {day, hour, minute}, close?: {...}}], weekday: ["Monday: 11 AM – 10 PM", …], utc_offset_minutes}
  add column if not exists opening_hours jsonb check (pg_column_size(opening_hours) <= 8192),
  -- When place-details last looked, including when Google had no match, so a miss isn't retried on every visit.
  add column if not exists google_checked_at timestamptz;
