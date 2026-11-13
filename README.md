# StashtagAI

Paste or share an Instagram or TikTok link; StashtagAI extracts what the post mentions and files it into lists,
e.g. a "restaurants to try in Denver" reel becomes **Eats › Restaurants › Denver** with five places.

Expo (SDK 58, TypeScript, Expo Router) app for **iOS first**, plus Android and web, backed by Supabase.

| Path | What |
| --- | --- |
| `src/app/` | Routes: `sign-in`, `auth/callback`, `(app)/index` (Home), `(app)/stash` (Stash a link sheet), `(app)/share` (share-sheet landing), `(app)/capture/[linkId]` (screenshots / recording / caption), `(app)/card/[linkId]` (live status + review), `(app)/kind/[kind]` (Kind › Category › List), `(app)/list/[listId]` (items) |
| `src/lib/capture/`, `modules/media-extract/` | On-device OCR, frame sampling, audio extraction and whisper transcription; see `docs/capture.md` |
| `src/lib/link-filter.ts` | Instagram/TikTok URL allowlist; re-exports `supabase/functions/_shared/link-filter.ts`, which `process-link` also uses (unit-tested in `src/lib/__tests__`) |
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

1. **Providers › Email**: enabled. The sign-in screen defaults to email + password (for testing), with the magic link
   as an alternative. To sign in straight after **Create account**, turn off **Confirm email**, or add the user under
   **Users › Add user** with **Auto Confirm User** ticked.
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

Over-the-air updates (`expo-updates`): each profile builds on its own channel (`development`,
`preview`, `production`; `development-device` inherits `development`). JS-only changes ship
without a new build:

```bash
npx eas-cli@latest update --channel preview --environment preview --message "..."
```

`runtimeVersion` uses the `fingerprint` policy, so an update only reaches builds with the same
native code. After adding or upgrading a native module, or changing plugins in `app.json`, make a
new build. `npx expo-updates fingerprint:generate` prints the current fingerprint to compare.

### Releasing to the App Store

`.eas/workflows/release-ios.yml` builds the `production` profile on EAS from the pushed GitHub
commit and uploads it to App Store Connect (TestFlight). It runs only when started:

```bash
npx eas-cli@latest workflow:run release-ios.yml --ref main
```

Progress is on expo.dev › stashtag › Workflows. Send the build for review from App Store Connect.
The workflow can't prompt for an Apple login, so it relies on (both already in place):

- An App Store Connect API key assigned to the project, kept in Expo's credential store, not in
  the repo. Check or replace it with `npx eas-cli@latest credentials --platform ios` › `production`
  › App Store Connect: Manage your API Key.
- `submit.production.ios.ascAppId` in `eas.json`: the app's numeric Apple ID (App Store Connect ›
  the app › App Information › General Information › Apple ID).

Static web build: `npm run build:web` (outputs `dist/`, a single-page app).

Share sheet, OCR and transcription use native modules (`expo-share-intent`, `expo-text-extractor`, `whisper.rn`, the
local `modules/media-extract`), so they need a development build. They don't work in Expo Go. Flow and package choices:
[`docs/capture.md`](docs/capture.md).

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

Screenshots for the design brief live in `docs/design/`. App Store listing artwork (product page header, search result
image) lives in `docs/store/`; it is uploaded in App Store Connect and is not bundled into the app. The board keeps the
source media in `~/Documents/StashtagAI`.

CI (`.github/workflows/ci.yml`) runs all three on every pull request and on pushes to `main`.

## Link filter

Only these hosts are accepted, compared **exactly** after URL parsing (never by substring), over https, without
credentials or ports: `instagram.com`, `www.instagram.com`, `tiktok.com`, `www.tiktok.com`, `m.tiktok.com`,
`vm.tiktok.com`. The path must be a post, reel or video (`/p/…`, `/reel/…`, `/@user/video/…`, short links). Query strings
and fragments are dropped before saving. The host list is enforced again by a `links.url` check constraint, and `process-link` re-runs the
same host and path rules (one shared module) on the server, so the client check is not the only line of defence.
