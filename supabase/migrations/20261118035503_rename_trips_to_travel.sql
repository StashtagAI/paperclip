-- HAN-85: rename the "trips" kind to "travel" so it can hold travel hacks and ideas, not only places to go.
-- Existing rows keep their kind; Postgres rewrites the label in place.
alter type public.list_kind rename value 'trips' to 'travel';
