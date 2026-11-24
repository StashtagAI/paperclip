# StashtagAI

Paste or share an Instagram or TikTok link; StashtagAI extracts what the post mentions and files it into lists,
e.g. a "restaurants to try in Denver" reel becomes **Eats › Restaurants › Denver** with five places.

Expo (SDK 58, TypeScript, Expo Router) app for **iOS first**, plus Android and web, backed by Supabase.

| Path | What |
| --- | --- |
| `src/app/` | Routes: `sign-in`, `auth/callback`, `(app)/index` (Home), `(app)/stash` (Stash a link sheet), `(app)/share` (share-sheet landing), `(app)/capture/[linkId]` (screenshots / recording / caption), `(app)/card/[linkId]` (live status + review), `(app)/kind/[kind]` (Kind › Category › List), `(app)/list/[listId]` (items), `(app)/profile` (appearance, feedback, support, billing, delete account) with its `(app)/feedback` and `(app)/delete-account` sheets |
| `src/lib/capture/`, `modules/media-extract/` | On-device OCR, frame sampling, audio extraction and whisper transcription; see `docs/capture.md` |
| `src/lib/link-filter.ts` | Instagram/TikTok URL allowlist; re-exports `supabase/functions/_shared/link-filter.ts`, which `process-link` also uses (unit-tested in `src/lib/__tests__`) |
| `src/lib/supabase.ts`, `src/lib/auth.tsx` | Supabase client and session context (email magic link / one-time code) |
| `src/constants/theme.ts`, `palette.ts` | Light/dark design tokens and per-kind `KindColors` (fill, `onColor`, chip); read via `useTheme()` / `useKindColors()`. Contrast is unit-tested. The user's System/Light/Dark choice is saved on device by `ColorSchemeProvider` (`src/hooks/use-color-scheme.tsx`) |
| `src/constants/brand.ts` | The pin mark (logo concept B). `npm run icons` regenerates every icon/splash PNG in `assets/images` from it |
| `src/constants/features.ts` | Feature flags (`shared` stashes: Premium, off) |
| `supabase/migrations/` | Database schema and row-level security |
| `supabase/functions/process-link/` | Extraction edge function (owned by Extraction, HAN-6) |
| `supabase/functions/delete-account/` | Deletes the caller's rows, storage objects and auth user with the service role (HAN-34, matches `legal/data-deletion.md`). Deploy with `supabase functions deploy delete-account` |
| `supabase/functions/place-details/` | Fills in the Google rating and opening hours for restaurants on an Eats list when it opens, refreshed weekly; uses `GOOGLE_PLACES_API_KEY` and counts toward process-link's daily spend caps (HAN-83). Deploy with `supabase functions deploy place-details` |
| `supabase/functions/shop-links/` | Buy links for Shop items (Amazon search first, then two stores that fit the item) and Send to Instacart pages for recipes and the shopping list (HAN-131). Affiliate IDs are function secrets; see "Affiliate links" below. Deploy with `supabase functions deploy shop-links` |
| `supabase/functions/waitlist/` | Launch waitlist signups from the landing page; the only write path to `waitlist_signups` (HAN-100, see `landing/README.md`). Deploy with `supabase functions deploy waitlist --no-verify-jwt` |

## Setup

Requires Node 24 and npm.

```bash
npm install
cp .env.example .env.local   # then fill in the anon key
```

Agent task worktrees use `scripts/worktree.sh` instead of `npm install`, so they share one install per lockfile; see
`docs/worktrees.md`, which also covers done-task cleanup and DB backup retention.

### Environment variables

| Name | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://qzaijqrkriuhlqbwmyto.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard › Project Settings › API › `anon` public key |

`.env` and `.env*.local` are git-ignored. Never commit keys, and never put the service-role key in the app: `EXPO_PUBLIC_*`
values are bundled into the client. For EAS builds, set the same two variables per environment
(`npx eas-cli@latest env:create`), since `.env.local` is not uploaded.

If the variables are missing the app shows a "Supabase not configured" screen instead of crashing.

### Affiliate links (HAN-131)

The Buy and Send to Instacart buttons are off until `EXPO_PUBLIC_SHOP_LINKS=1` is set for the build. The affiliate IDs
are `shop-links` function secrets, so they change without an app release. Unset, blank, or `placeholder…` values count
as unset: Buy links then go to plain store searches with no tag, and Send to Instacart replies "not switched on yet".

| Secret | Value |
| --- | --- |
| `AMAZON_ASSOCIATE_TAG` | Amazon Associates tracking ID, e.g. `stashtag-20`. Added as `tag=` to Amazon searches |
| `AFFILIATE_WRAPPER` | `sovrn` or `skimlinks`: the network that wraps every non-Amazon store link |
| `AFFILIATE_WRAPPER_ID` | Sovrn Commerce API key, or Skimlinks publisher ID (e.g. `123456X789012`) |
| `INSTACART_API_KEY` | Instacart Developer Platform key |
| `INSTACART_API_BASE` | Optional. `https://connect.instacart.com` (default) or `https://connect.dev.instacart.tools` for a development key |
| `INSTACART_PER_HOUR` | Optional. Instacart pages one user can make per hour (default `20`; `0` switches it off) |

The function builds every Instacart page from the caller's own saved recipes (the app sends only recipe ids), counts
calls with the `claim_instacart_quota` RPC, and returns only `instacart.com` URLs (HAN-134).

```bash
supabase secrets set AMAZON_ASSOCIATE_TAG=placeholder AFFILIATE_WRAPPER=sovrn AFFILIATE_WRAPPER_ID=placeholder INSTACART_API_KEY=placeholder
supabase functions deploy shop-links
```

Amazon's rules: links open in the browser or Amazon app, never in an in-app web view, and the disclosure
("As an Amazon Associate, StashtagAI earns from qualifying purchases") sits next to every Buy button.

### Database

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref qzaijqrkriuhlqbwmyto
supabase db push            # applies supabase/migrations/*.sql
```

Schema: `links` (url, platform, status `pending|processing|done|failed`, raw_content, tags, error) →
`categories` (kind `eats|travel|recipes|do`, name) › `lists` (name = scope such as "Denver", tags) › `items`
(name, description, address, lat/lng, source `link_id`). RLS limits every table to the signed-in user's rows; clients may
only insert links as `pending` and cannot update them; `process-link` uses the service role.

Migrations (HAN-54): `main` is the source of truth and matches production's `supabase_migrations.schema_migrations`.
Supabase keys each migration by its 14-digit version, so every file needs its own version: two branches that both use
`20261113180000` clash, and one of them is skipped. Name new files with the current UTC time
(`supabase migration new <name>`), and rebase onto `main` before merging. If you apply a migration to production with the
MCP `apply_migration` tool or the dashboard, it gets a new version, so rename the file to match
(`select version, name from supabase_migrations.schema_migrations order by version`). Check before `db push` with
`supabase migration list`: local and remote columns must match row for row.

Security tests (HAN-46, both run in CI):

```bash
# RLS: every table, user A against user B's rows and anon. Needs an EMPTY Supabase Postgres, never a real project.
docker run -d --name rls-test -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:55432:5432 public.ecr.aws/supabase/postgres:17.11.0.011
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres scripts/test-db.sh
# process-link: other users' link_id, and the prompt-injection fixtures in injection-fixtures.ts
node --experimental-strip-types supabase/functions/process-link/security.test.ts
```

A new table fails `supabase/tests/database/rls.test.sql` until it has RLS and tests of its own.

### Auth

Supabase dashboard › Authentication:

1. **Providers › Email**: enabled. The sign-in screen defaults to email + password (for testing), with the magic link
   as an alternative. To sign in straight after **Create account**, turn off **Confirm email**, or add the user under
   **Users › Add user** with **Auto Confirm User** ticked.
2. **URL Configuration › Redirect URLs**: add `stashtag://auth/callback`, `stashtag://**`, and your web origins, e.g.
   `http://localhost:8081/auth/callback` and the deployed web URL.
3. Optional but recommended on iOS: in **Email Templates › Magic Link** add `{{ .Token }}` so the email also carries a
   6-digit code that can be typed into the app when the link opens in a different browser.
4. **Rate Limits** (HAN-38, abuse limits on sign-in): keep Supabase's throttles on, with these values or tighter:
   emails sent **30/hour** for the project (the built-in email service is fixed at 2/hour until custom SMTP is set
   up), sign-ups and sign-ins **30 per 5 minutes per IP**, token verifications **30 per 5 minutes per IP**. Under
   **Providers › Email**, keep the minimum interval between emails to one address at **60 seconds**. The app counts down
   that 60 seconds on its resend button (`EMAIL_RESEND_SECONDS` in `src/lib/rate-limit.ts`) and turns any 429 from Auth
   into a plain "wait and try again" message.

5. **Google, Apple and Facebook** (HAN-112): providers, Apple Services ID and key, Meta app, manual linking and the
   Apple function secrets are in [docs/social-sign-in.md](docs/social-sign-in.md). The Apple secret key for the web
   flow expires every 6 months (`scripts/apple-client-secret.ts` makes a new one).

Feedback inserts are capped in the database: 5 per account in any 10 minutes and 20 in any 24 hours
(`feedback_rate_limit` trigger). Over the cap, PostgREST returns HTTP 429 (`PT429`) and the feedback sheet keeps the
draft and says to try later.

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
The fingerprint also hashes `.gitignore`: editing it changes the runtime version just like a native
change, so an update published afterwards silently skips the current TestFlight build.

### Releasing to the App Store

`.eas/workflows/release-ios.yml` builds the `production` profile on EAS from the pushed GitHub
commit and uploads it to App Store Connect (TestFlight). It runs only when started:

```bash
git fetch origin main
npx eas-cli@latest workflow:run release-ios.yml --ref $(git rev-parse origin/main)
```

`--ref` resolves against your local checkout, so `--ref main` uses a possibly stale local `main`
(it fails with "Failed to read .eas/workflows/release-ios.yml" if that predates the workflow).
Passing the fetched commit SHA always runs GitHub's latest `main`. You can also start it from
expo.dev › stashtag › Workflows.

Progress is on expo.dev › stashtag › Workflows. Send the build for review from App Store Connect.
The workflow can't prompt for an Apple login, so it relies on (both already in place):

- An App Store Connect API key assigned to the project, kept in Expo's credential store, not in
  the repo. Check or replace it with `npx eas-cli@latest credentials --platform ios` › `production`
  › App Store Connect: Manage your API Key.
- `submit.production.ios.ascAppId` in `eas.json`: the app's numeric Apple ID (App Store Connect ›
  the app › App Information › General Information › Apple ID).

Static web build: `npm run build:web` (outputs `dist/`, one pre-rendered HTML page per route).

Web security headers (CSP, HSTS, `X-Frame-Options`, referrer and permissions policy) live in `app.json` under the
`expo-router` plugin's `headers`. Expo Hosting only serves them with `web.output: "static"`: the export writes them to
`dist/_expo/.routes.json`. `npx expo serve` serves `dist/` with the same headers for a local check. If the web app
starts loading from a new origin, add it to the CSP. CI runs `scripts/check-web-headers.mjs` on the export, which
also fails if an inline script isn't allowed by its hash. CI also scans for secrets (gitleaks) and vulnerable
dependencies (dependency review on PRs, `npm audit --audit-level=high`).

Shared lists (HAN-50) open at `/s/<token>`, so the web host must serve `index.html` for unknown paths (SPA fallback).
Set `EXPO_PUBLIC_WEB_URL` to that host so links shared from a phone open for friends without the app.

Share sheet, OCR and transcription use native modules (`expo-share-intent`, `expo-text-extractor`, `whisper.rn`, the
local `modules/media-extract`), so they need a development build. They don't work in Expo Go. Flow and package choices:
[`docs/capture.md`](docs/capture.md).

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

Database checks for shared lists run against a scratch Postgres with every migration applied (for example the
`public.ecr.aws/supabase/postgres` image): `psql -v ON_ERROR_STOP=1 -f supabase/tests/list_shares_test.sql`.

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
