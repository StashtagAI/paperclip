# Google, Apple and Facebook sign-in (HAN-112)

## How it works

| | iPhone | Android | Web |
| --- | --- | --- | --- |
| Apple | Native Apple sheet → `signInWithIdToken` (hashed nonce) | Supabase OAuth in an in-app browser | Supabase OAuth, full-page redirect |
| Google | Supabase OAuth in an in-app browser | same | Supabase OAuth, full-page redirect |
| Facebook | Supabase OAuth in an in-app browser | same | Supabase OAuth, full-page redirect |

Code: `src/lib/social-auth.ts` (flows), `src/lib/sign-in-providers.ts` (pure helpers), `src/components/social-sign-in.tsx`
(buttons), Profile › Sign-in methods (connect a provider to the signed-in account).

- **Same email, same account.** Supabase links a Google/Apple/Facebook identity to an existing account automatically
  when the emails match and the provider says the email is verified. If the existing account's email was never
  confirmed, Supabase removes that unconfirmed email identity first, so nobody can pre-register someone else's address.
- **Apple "Hide My Email".** The relay address (`…@privaterelay.appleid.com`) never matches an existing account, so it
  makes a new one. To reach an existing account, sign in with email, then Profile › Sign-in methods › Connect Apple
  (`linkIdentity`, needs **Manual linking** on). Profile shows when the account email is a relay address, because
  friends sharing lists by email have to use it.
- **Apple token revocation.** After an Apple sign-in, the app sends Apple's authorization code (iPhone) or refresh token
  (web/Android) to the `apple-token` function, which checks it with Apple and stores the refresh token in
  `apple_tokens` (no client access). `delete-account` revokes every stored token with Apple before deleting the
  account, which also removes Stashtag from the user's Apple ID settings.
- We ask Apple for **email only**, not the name.

## Setup checklist

Supabase project: `qzaijqrkriuhlqbwmyto`. Supabase callback URL for every provider:
`https://qzaijqrkriuhlqbwmyto.supabase.co/auth/v1/callback`

### Apple (developer.apple.com › Certificates, Identifiers & Profiles)

1. **Identifiers › App ID `ai.stashtag.app`**: tick **Sign in with Apple** (Enable as a primary App ID). Leave the
   server-to-server notification endpoint blank.
2. **Identifiers › + › Services IDs**: create `ai.stashtag.web` (description "StashtagAI web"). Tick **Sign in with
   Apple** › Configure: primary App ID `ai.stashtag.app`, **Domains** `qzaijqrkriuhlqbwmyto.supabase.co`, **Return URLs**
   `https://qzaijqrkriuhlqbwmyto.supabase.co/auth/v1/callback`.
3. **Keys › +**: name "StashtagAI Sign in with Apple", tick **Sign in with Apple**, configure with primary App ID
   `ai.stashtag.app`. Download `AuthKey_<KEY_ID>.p8` (only downloadable once) and note the **Key ID** and your **Team ID**.
4. *Only once we send auth emails from our own domain through custom SMTP; skip it until then.*
   **Services › Sign in with Apple for Email Communication** › Configure: add the domain and the From address of the
   auth emails (Supabase › Authentication › Emails › SMTP settings) so Apple forwards our emails to "Hide My Email"
   users. The domain must pass SPF. Sign in with Apple works without this step. Without it, the only thing Hide My Email
   users miss is auth email (magic links, "identity linked" notices). Supabase's built-in sender only delivers to
   project team members anyway, and the app sends no other email.
5. Make the 6-month client secret on your laptop (the key stays there):
   `node --experimental-strip-types scripts/apple-client-secret.ts <TEAM_ID> <KEY_ID> path/to/AuthKey_<KEY_ID>.p8`
   **It expires after 6 months**; set a reminder to rerun it and paste the new value, or web/Android Apple sign-in stops.

### Google (console.cloud.google.com, a project for StashtagAI)

1. **Google Auth Platform › Branding**: app name StashtagAI, support email support@stashtag.ai, home page
   `https://stashtag.ai/`, privacy policy `https://stashtag.ai/privacy/`, terms `https://stashtag.ai/terms/`,
   authorized domains `stashtag.ai` and `supabase.co`.
2. **Audience**: External, then **Publish app** (In production). Only the non-sensitive `openid`, `email` and `profile`
   scopes are used, so no Google verification review is needed.
3. **Clients › Create client** › Web application: **Authorized JavaScript origins** `https://app.stashtag.ai`;
   **Authorized redirect URIs** `https://qzaijqrkriuhlqbwmyto.supabase.co/auth/v1/callback`. Copy the client ID and secret.
   (No iOS or Android client is needed: the apps use the browser flow.)

### Facebook (developers.facebook.com › My Apps › Create app)

1. Use case **Authenticate and request data from users with Facebook Login**; app type Consumer; name StashtagAI;
   contact email support@stashtag.ai.
2. **Use cases › Facebook Login › Customize › Permissions**: add `email` (`public_profile` is there by default).
3. **Facebook Login › Settings**: Client OAuth login **on**, Web OAuth login **on**, **Valid OAuth Redirect URIs**
   `https://qzaijqrkriuhlqbwmyto.supabase.co/auth/v1/callback`.
4. **App settings › Basic**: App domains `stashtag.ai`; Privacy Policy URL `https://stashtag.ai/privacy/`; Terms of
   Service URL `https://stashtag.ai/terms/`; **User data deletion** › Data deletion instructions URL
   `https://stashtag.ai/data-deletion/`; app icon (1024×1024, `assets/images/icon.png`); category. Copy the **App ID**
   and **App Secret**.
5. Switch the app to **Live** (Publish). Until then only people with a role on the app can sign in.

### Supabase (dashboard › Authentication)

1. **Sign In / Providers › Apple**: enable. **Client IDs** `ai.stashtag.web,ai.stashtag.app` (Services ID **first**:
   the web flow uses the first one; native iPhone tokens are accepted for any). **Secret Key (for OAuth)**: the value
   from Apple step 5.
2. **Google**: enable; client ID and secret from Google step 3. Leave "Skip nonce checks" off.
3. **Facebook**: enable; App ID as client ID, App Secret as secret.
4. **Sign In / Providers › User Signups**: turn on **Allow manual linking** (Profile › Connect Apple/Google/Facebook).
   Keep **Allow new users to sign up** on.
5. **URL Configuration › Redirect URLs**: must include `stashtag://auth/callback` and `https://app.stashtag.ai/auth/callback`
   (both are already used by email links; nothing new if they're there).
6. Optional: **Emails › Security notifications › Identity linked** on, so people get an email when a provider is added.
7. **Edge Functions › Secrets**: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the whole .p8 file, including the
   BEGIN/END lines), `APPLE_BUNDLE_ID=ai.stashtag.app`, `APPLE_SERVICES_ID=ai.stashtag.web`. Used by `apple-token` and
   `delete-account` to revoke Apple tokens; sign-in works without them, but deletion can't revoke.

### Deploy

```bash
supabase db push                                   # apple_tokens (migration 20261119222601)
supabase functions deploy apple-token delete-account
```

The iPhone app needs a new native build (the Sign in with Apple entitlement and `expo-apple-authentication`); an OTA
update can't add them.
