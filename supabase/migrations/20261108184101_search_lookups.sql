-- Cache of web-search research hits so re-running a card does not search again.
-- Written only by the process-link function (service role); no client access.
create table public.search_lookups (
  query_key text primary key,
  fill jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.search_lookups enable row level security;
