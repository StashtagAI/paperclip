-- HAN-6: stage logging, user feedback, and a timeout sweep for stuck links.

-- process_events: one row per pipeline stage. Written by the process-link function (service role)
-- and, for client-side diagnostics, by the signed-in user. Holds counts, lengths and item names only:
-- never secrets, never full captions.
create table public.process_events (
  id bigint generated always as identity primary key,
  link_id uuid references public.links (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null default 'function' check (source in ('function', 'client', 'sweep')),
  stage text not null check (length(stage) <= 40),
  ok boolean not null default true,
  ms integer,
  detail jsonb not null default '{}' check (pg_column_size(detail) <= 16384),
  created_at timestamptz not null default now()
);
create index process_events_link_idx on public.process_events (link_id, created_at);
create index process_events_user_idx on public.process_events (user_id, created_at desc);
alter table public.process_events enable row level security;
create policy "read own events" on public.process_events
  for select to authenticated using (user_id = auth.uid());
-- Clients may add only their own client-side events, for links they own.
create policy "insert own client events" on public.process_events
  for insert to authenticated with check (
    user_id = auth.uid() and source = 'client'
    and (link_id is null or exists (select 1 from public.links l where l.id = link_id and l.user_id = auth.uid()))
  );

-- link_feedback: thumbs up/down on a processed link, with a snapshot of what was extracted.
create type public.feedback_rating as enum ('up', 'down');
create type public.feedback_reason as enum ('wrong_category', 'wrong_items', 'missed_items');
create table public.link_feedback (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.links (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating public.feedback_rating not null,
  reason public.feedback_reason,
  note text check (length(note) <= 1000),
  snapshot jsonb,          -- extracted output at feedback time, filled by trigger
  created_at timestamptz not null default now(),
  unique (link_id, user_id),
  check (rating = 'down' or reason is null)
);
alter table public.link_feedback enable row level security;
create policy "own feedback select" on public.link_feedback for select to authenticated using (user_id = auth.uid());
create policy "own feedback insert" on public.link_feedback for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.links l where l.id = link_id and l.user_id = auth.uid())
);
create policy "own feedback update" on public.link_feedback for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own feedback delete" on public.link_feedback for delete to authenticated using (user_id = auth.uid());

-- Snapshot what was extracted so feedback can be matched to the output. Client-supplied snapshot is ignored.
create function public.link_feedback_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.snapshot := (
    select jsonb_build_object(
      'status', l.status,
      'unsorted', coalesce(l.raw_content ->> 'unsorted', 'false') = 'true',
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('name', i.name, 'list', li.name, 'category', c.name, 'kind', c.kind))
        from public.items i
        join public.lists li on li.id = i.list_id
        join public.categories c on c.id = li.category_id
        where i.link_id = l.id
      ), '[]'::jsonb))
    from public.links l where l.id = new.link_id);
  return new;
end $$;
create trigger link_feedback_snapshot before insert or update on public.link_feedback
  for each row execute function public.link_feedback_snapshot();
revoke execute on function public.link_feedback_snapshot() from public, anon, authenticated;

-- Timeout sweep: pending/processing for over 5 minutes becomes failed/timeout.
create function public.sweep_stuck_links() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with s as (
    update public.links set status = 'failed', error = 'timeout'
    where status in ('pending', 'processing') and updated_at < now() - interval '5 minutes'
    returning id, user_id, status
  ), ev as (
    insert into public.process_events (link_id, user_id, source, stage, ok, detail)
    select id, user_id, 'sweep', 'timeout', false, '{}'::jsonb from s
  )
  select count(*) into n from s;
  return n;
end $$;
revoke execute on function public.sweep_stuck_links() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('sweep-stuck-links', '* * * * *', 'select public.sweep_stuck_links()');
