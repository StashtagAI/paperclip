-- Cache of resolved Google Places hits so re-running a link does not call Google again.
-- Written only by the process-link function (service role); no client access.
create table public.place_lookups (
  query_key text primary key,
  place_id text,
  name text not null,
  address text not null,
  lat double precision,
  lng double precision,
  maps_uri text,
  created_at timestamptz not null default now()
);
alter table public.place_lookups enable row level security;
