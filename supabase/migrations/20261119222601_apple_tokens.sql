-- HAN-112: Sign in with Apple refresh tokens, kept only so deleting an account can revoke them with Apple (App Store
-- Review 5.1.1(v)). One row per account and Apple client ID: the App ID for native iOS sign-in, the Services ID for the
-- web/Android OAuth flow. Written by the apple-token function and read by delete-account, both with the service role.
-- Clients get no grants at all, so a token can't be read back even by its owner.
create table public.apple_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null check (length(client_id) <= 255),
  refresh_token text not null check (length(refresh_token) <= 2048),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table public.apple_tokens enable row level security;
revoke all on public.apple_tokens from anon, authenticated;
