-- HAN-34: app feedback from the Profile page, and the lookup the delete-account function uses for storage.

-- feedback: free-text feedback about the app (link_feedback is the per-card thumbs up/down).
-- Users can only add their own rows. There is no select/update/delete for clients: QA triages with the service role
-- or the dashboard, using status/reviewed_at.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 4000),
  category text check (category in ('bug', 'idea', 'other')),
  app_version text check (length(app_version) <= 40),
  platform text check (platform in ('ios', 'android', 'web')),
  status text not null default 'new' check (status in ('new', 'reviewed', 'closed')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index feedback_status_created_idx on public.feedback (status, created_at desc);
create index feedback_user_idx on public.feedback (user_id);

alter table public.feedback enable row level security;
create policy "insert own feedback" on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new' and reviewed_at is null);

revoke all on public.feedback from anon;
revoke select, update, delete, truncate on public.feedback from authenticated;
grant insert on public.feedback to authenticated;

-- Storage objects a user owns (uploaded by them, or filed under a "<user_id>/" folder), so delete-account can remove
-- them through the Storage API. Service role only.
create or replace function public.user_storage_objects(p_user_id uuid)
returns table (bucket_id text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where o.owner_id = p_user_id::text or o.owner = p_user_id or o.name like p_user_id::text || '/%';
$$;
revoke execute on function public.user_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.user_storage_objects(uuid) to service_role;
