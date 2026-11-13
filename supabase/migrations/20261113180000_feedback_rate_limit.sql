-- HAN-38 (S2): cap how much free-text feedback one account can send, so a script or stuck client can't spam QA or
-- bloat the table. Generous for a real person: 5 in any 10 minutes and 20 in any 24 hours.
-- Over the cap the insert fails with SQLSTATE PT429, which PostgREST returns as HTTP 429 (code "PT429"); the app shows
-- a "try again later" message. Sign-in email limits are Supabase Auth settings, not SQL (see README).
-- link_feedback (thumbs) needs no quota: it is one row per link per user (unique), so links bound it.

create function public.feedback_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Serialise concurrent inserts from the same user so parallel requests can't all pass the count.
  perform pg_advisory_xact_lock(hashtextextended('feedback_rate_limit:' || new.user_id::text, 0));
  if (select count(*) from public.feedback f
      where f.user_id = new.user_id and f.created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.feedback f
         where f.user_id = new.user_id and f.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'feedback_rate_limited'
      using errcode = 'PT429', detail = 'Feedback is limited to 5 per 10 minutes and 20 per day.';
  end if;
  -- Clients can't backdate a row to slip under the window.
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.feedback_rate_limit() from public, anon, authenticated;

create trigger feedback_rate_limit before insert on public.feedback
  for each row execute function public.feedback_rate_limit();

-- The window counts use (user_id, created_at); this replaces the user_id-only index.
create index feedback_user_created_idx on public.feedback (user_id, created_at desc);
drop index public.feedback_user_idx;
