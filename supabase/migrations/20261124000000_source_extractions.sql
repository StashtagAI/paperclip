-- HAN-129: one extraction per public post, reused when another user stashes the same link.
-- Server-only (process-link, service role). Holds no user ids: the key is the post, the value is what was read from the
-- public post (caption/transcript/OCR the server fetched itself) and the extraction derived from it. Text a user sent
-- from their phone is never stored here. Entries expire after 30 days (checked on read), so an edited or deleted post is
-- re-read at most a month later. Cache effectiveness is measured from process_events stage 'source_cache' (detail.hit).
create table public.source_extractions (
  source_key text primary key,
  extraction jsonb not null,
  raw_content jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.source_extractions enable row level security;
revoke all on public.source_extractions from anon, authenticated;
