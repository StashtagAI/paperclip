-- HAN-46: a user could update their own feedback row to point link_id at someone else's link; the security definer
-- snapshot trigger then copied that link's items (names, lists, categories) into a row the user can read.
-- Updates now need the same link ownership as inserts, and the trigger only ever snapshots the row owner's link.
drop policy "own feedback update" on public.link_feedback;
create policy "own feedback update" on public.link_feedback for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and exists (select 1 from public.links l where l.id = link_id and l.user_id = auth.uid())
  );

create or replace function public.link_feedback_snapshot() returns trigger
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
        where i.link_id = l.id and i.user_id = new.user_id
      ), '[]'::jsonb))
    from public.links l where l.id = new.link_id and l.user_id = new.user_id);
  return new;
end $$;
revoke execute on function public.link_feedback_snapshot() from public, anon, authenticated;
