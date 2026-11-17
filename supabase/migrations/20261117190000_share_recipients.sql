-- HAN-68: a shared list opens only for the people the owner shared it with (board decision on HAN-66).
-- Step 1: no signed-out access. /s/<token> asks people to sign in first and keeps the token across sign-in.
-- Recipients and the owner-or-recipient check in get_shared_list / add_shared_list follow once the board picks how
-- recipients are identified.

revoke execute on function public.get_shared_list(text) from public, anon;
grant execute on function public.get_shared_list(text) to authenticated;
