-- HAN-7: with on-device capture, "pending" means the link is waiting for the user to add what the post says
-- (screenshots, recording, caption), which can take longer than 5 minutes. Only a stuck "processing" run times out.
create or replace function public.sweep_stuck_links() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with s as (
    update public.links set status = 'failed', error = 'timeout'
    where status = 'processing' and updated_at < now() - interval '5 minutes'
    returning id, user_id, status
  ), ev as (
    insert into public.process_events (link_id, user_id, source, stage, ok, detail)
    select id, user_id, 'sweep', 'timeout', false, '{}'::jsonb from s
  )
  select count(*) into n from s;
  return n;
end $$;
revoke execute on function public.sweep_stuck_links() from public, anon, authenticated;
