# StashtagAI

Paste or share an Instagram or TikTok link; StashtagAI extracts what the post mentions and files it into lists,
e.g. a "restaurants to try in Denver" reel becomes **Eats › Restaurants › Denver** with five places.

Expo (SDK 58, TypeScript, Expo Router) app for **iOS first**, plus Android and web, backed by Supabase.

| Path | What |
| --- | --- |
| `src/app/` | Routes: `sign-in`, `auth/callback`, `(app)/index` (Home), `(app)/stash` (Stash a link sheet), `(app)/kind/[kind]` (Kind › Category › List), `(app)/list/[listId]` (items) |
| `src/lib/link-filter.ts` | Instagram/TikTok URL allowlist (unit-tested in `src/lib/__tests__`) |
| `src/lib/supabase.ts`, `src/lib/auth.tsx` | Supabase client and session context (email magic link / one-time code) |
| `src/constants/theme.ts`, `palette.ts` | Light/dark design tokens and per-kind `KindColors` (fill, `onColor`, chip); read via `useTheme()` / `useKindColors()`. Contrast is unit-tested |
| `src/constants/brand.ts` | The pin mark (logo concept B). `npm run icons` regenerates every icon/splash PNG in `assets/images` from it |
| `src/constants/features.ts` | Feature flags (`shared` stashes: Premium, off) |
| `supabase/migrations/` | Database schema and row-level security |
| `supabase/functions/process-link/` | Extraction edge function (owned by Extraction, HAN-6) |

## Setup

Requires Node 24 and npm.

```bash
npm install
cp .env.example .env.local   # then fill in the anon key
```

### Environment variables

| Name | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://qzaijqrkriuhlqbwmyto.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard › Project Settings › API › `anon` public key |

`.env` and `.env*.local` are git-ignored. Never commit keys, and never put the service-role key in the app: `EXPO_PUBLIC_*`
values are bundled into the client. For EAS builds, set the same two variables per environment
(`npx eas-cli@latest env:create`), since `.env.local` is not uploaded.

If the variables are missing the app shows a "Supabase not configured" screen instead of crashing.

### Database

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref qzaijqrkriuhlqbwmyto
supabase db push            # applies supabase/migrations/*.sql
```

Schema: `links` (url, platform, status `pending|processing|done|failed`, raw_content, tags, error) →
`categories` (kind `eats|trips|recipes|do`, name) › `lists` (name = scope such as "Denver", tags) › `items`
(name, description, address, lat/lng, source `link_id`). RLS limits every table to the signed-in user's rows; clients may
only insert links as `pending` and cannot update them; `process-link` uses the service role.

### Auth

Supabase dashboard › Authentication:

1. **Providers › Email**: enabled (magic link is the default).
2. **URL Configuration › Redirect URLs**: add `stashtag://auth/callback`, `stashtag://**`, and your web origins, e.g.
   `http://localhost:8081/auth/callback` and the deployed web URL.
3. Optional but recommended on iOS: in **Email Templates › Magic Link** add `{{ .Token }}` so the email also carries a
   6-digit code that can be typed into the app when the link opens in a different browser.

## Running

```bash
npm run ios        # iOS simulator (main target); needs Xcode on macOS
npm run android    # Android emulator/device
npm run web        # http://localhost:8081
```

`expo-dev-client` is installed, so native runs use a **development build** rather than Expo Go:

```bash
npx expo run:ios                                           # local build to the simulator
npx eas-cli@latest build --profile development --platform ios   # cloud simulator build
```

EAS profiles (`eas.json`):

| Profile | Use |
| --- | --- |
| `development` | Dev client, iOS simulator build |
| `development-device` | Dev client on a physical, registered iPhone |
| `preview` | Internal distribution build |
| `production` | Store/TestFlight build, auto-incremented build number |

First EAS use: `npx eas-cli@latest login` then `npx eas-cli@latest init` to attach the project ID to `app.json`.
Bundle ID / package: `ai.stashtag.app`.

Static web build: `npm run build:web` (outputs `dist/`, a single-page app).

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

Screenshots for the design brief live in `docs/design/`.

CI (`.github/workflows/ci.yml`) runs all three on every pull request and on pushes to `main`.

## Link filter

Only these hosts are accepted, compared **exactly** after URL parsing (never by substring), over https, without
credentials or ports: `instagram.com`, `www.instagram.com`, `tiktok.com`, `www.tiktok.com`, `m.tiktok.com`,
`vm.tiktok.com`. The path must be a post, reel or video (`/p/…`, `/reel/…`, `/@user/video/…`, short links). Query strings
and fragments are dropped before saving. The same host list is enforced again by a `links.url` check constraint and by
`process-link` on the server, so the client check is not the only line of defence.
