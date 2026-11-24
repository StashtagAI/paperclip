-- HAN-128: admin portal. A handful of accounts can read usage, cost, user and stash totals across all users.
--
-- Who is an admin lives in admin_users, set by an operator in SQL (README › Admin portal), never by the app. Each row
-- binds an allowlisted email to one account id. Production auto-confirms email sign-ups, so email_confirmed_at doesn't
-- prove someone owns an address: matching on email alone would let anyone who signs up first with an allowlisted
-- address in. The account must also still have that email, so changing it drops admin rights.

create table public.admin_users (
  email text primary key check (email = lower(email) and length(email) <= 254),
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
-- Server-only: no client grants at all, not even read.
revoke all on public.admin_users from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_users a join auth.users u on u.id = a.user_id
    where a.user_id = auth.uid() and lower(u.email) = a.email
      and u.email_confirmed_at is not null and u.deleted_at is null
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Everything the admin screen shows, in one call. Raises 42501 for anyone not in admin_users. Costs are the
-- list-price estimates process-link and place-details book as stage 'cost' events (HAN-37), not invoices.
create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d1 timestamptz := now() - interval '24 hours';
  d7 timestamptz := now() - interval '7 days';
  d30 timestamptz := now() - interval '30 days';
  today timestamptz := date_trunc('day', now(), 'UTC');
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'new_7d', count(*) filter (where created_at >= d7),
        'new_30d', count(*) filter (where created_at >= d30),
        'signed_in_7d', count(*) filter (where last_sign_in_at >= d7))
      from auth.users where deleted_at is null),
    -- Active: stashed a link or added an item themselves in the window.
    'active', (
      with a as (
        select user_id, created_at from public.links where created_at >= d30
        union all
        select user_id, created_at from public.items where created_at >= d30 and link_id is null)
      select jsonb_build_object(
        'd1', count(distinct user_id) filter (where created_at >= d1),
        'd7', count(distinct user_id) filter (where created_at >= d7),
        'd30', count(distinct user_id))
      from a),
    'stashes', (
      select jsonb_build_object(
        'd1', count(*) filter (where created_at >= d1),
        'd7', count(*) filter (where created_at >= d7),
        'd30', count(*) filter (where created_at >= d30),
        'total', count(*),
        'done_30d', count(*) filter (where created_at >= d30 and status = 'done'),
        'failed_30d', count(*) filter (where created_at >= d30 and status = 'failed'),
        'in_progress', count(*) filter (where status in ('pending', 'processing')),
        'not_sorted_30d', count(*) filter (where created_at >= d30 and status = 'done'
          and coalesce(raw_content ->> 'unsorted', 'false') = 'true'),
        'instagram_30d', count(*) filter (where created_at >= d30 and platform = 'instagram'),
        'tiktok_30d', count(*) filter (where created_at >= d30 and platform = 'tiktok'),
        'median_seconds_30d', round(extract(epoch from percentile_cont(0.5) within group (order by processed_at - created_at)
          filter (where created_at >= d30 and status = 'done' and processed_at is not null)))::int)
      from public.links),
    'failures_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('error', error, 'count', n) order by n desc, error), '[]'::jsonb)
      from (select coalesce(error, 'unknown') as error, count(*) as n from public.links
            where status = 'failed' and created_at >= d30 group by 1 order by 2 desc, 1 limit 8) f),
    'items', (
      select jsonb_build_object(
        'total', count(*),
        'd7', count(*) filter (where created_at >= d7),
        'from_links_30d', count(*) filter (where created_at >= d30 and link_id is not null))
      from public.items),
    'costs', (
      select jsonb_build_object(
        'today', coalesce(sum(usd) filter (where created_at >= today), 0),
        'd1', coalesce(sum(usd) filter (where created_at >= d1), 0),
        'd7', coalesce(sum(usd) filter (where created_at >= d7), 0),
        'd30', coalesce(sum(usd) filter (where created_at >= d30), 0),
        'total', coalesce(sum(usd), 0),
        'process_link_30d', coalesce(sum(usd) filter (where created_at >= d30 and fn is null), 0),
        'process_link_runs_30d', count(*) filter (where created_at >= d30 and fn is null),
        'place_details_30d', coalesce(sum(usd) filter (where created_at >= d30 and fn = 'place-details'), 0),
        'apify_30d', coalesce(sum((detail ->> 'apify_usd')::numeric) filter (where created_at >= d30), 0),
        'video_30d', coalesce(sum((detail ->> 'video_usd')::numeric) filter (where created_at >= d30), 0),
        'claude_calls_30d', coalesce(sum((detail ->> 'anthropic_calls')::int) filter (where created_at >= d30), 0),
        'input_tokens_30d', coalesce(sum((detail ->> 'input_tokens')::bigint) filter (where created_at >= d30), 0),
        'output_tokens_30d', coalesce(sum((detail ->> 'output_tokens')::bigint) filter (where created_at >= d30), 0),
        'web_searches_30d', coalesce(sum((detail ->> 'web_searches')::int) filter (where created_at >= d30), 0),
        'places_calls_30d', coalesce(sum((detail ->> 'places_calls')::int) filter (where created_at >= d30), 0),
        'geocode_calls_30d', coalesce(sum((detail ->> 'geocode_calls')::int) filter (where created_at >= d30), 0))
      from (select created_at, detail, detail ->> 'fn' as fn, coalesce((detail ->> 'usd')::numeric, 0) as usd
            from public.process_events where source = 'function' and stage = 'cost') c),
    'limits_7d', (
      select jsonb_build_object(
        'refused_runs', count(*) filter (where stage = 'quota' and detail ->> 'allowed' = 'false'),
        'alerts', count(*) filter (where stage = 'alert'))
      from public.process_events where source = 'function' and stage in ('quota', 'alert') and created_at >= d7),
    'engagement', jsonb_build_object(
      'thumbs_up_30d', (select count(*) from public.link_feedback where rating = 'up' and created_at >= d30),
      'thumbs_down_30d', (select count(*) from public.link_feedback where rating = 'down' and created_at >= d30),
      'feedback_new', (select count(*) from public.feedback where status = 'new'),
      'feedback_7d', (select count(*) from public.feedback where created_at >= d7),
      'shared_lists', (select count(*) from public.list_shares),
      'waitlist_total', (select count(*) from public.waitlist_signups),
      'waitlist_7d', (select count(*) from public.waitlist_signups where created_at >= d7)),
    -- Last 14 UTC days, oldest first.
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', to_char(day, 'YYYY-MM-DD'),
        'stashes', (select count(*) from public.links where created_at >= day and created_at < day + interval '1 day'),
        'new_users', (select count(*) from auth.users where deleted_at is null
                        and created_at >= day and created_at < day + interval '1 day'),
        'usd', (select coalesce(sum((detail ->> 'usd')::numeric), 0) from public.process_events
                where source = 'function' and stage = 'cost' and created_at >= day and created_at < day + interval '1 day'))
        order by day)
      from generate_series(today - interval '13 days', today, interval '1 day') day)
  );
end $$;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
