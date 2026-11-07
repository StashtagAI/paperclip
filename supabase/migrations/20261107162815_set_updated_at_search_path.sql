-- Pin search_path on the updated_at trigger function (advisor 0011).
alter function public.set_updated_at() set search_path = '';
