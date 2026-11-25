# Free and Premium (HAN-132)

The plan was approved on HAN-127. The free cap comes from HAN-129.

| | Free | Premium |
|---|---|---|
| AI stashes | 15 a month (resets on the 1st, UTC) | Unlimited, with a fair-use ceiling of 300 a month |
| Lists shared at the same time | 5 | 100 |
| Custom organization | – | Yes (flag only; no feature is gated yet) |
| Export an Eats/Travel list to Google My Maps (KML, HAN-141) | – | Yes (checked in the app; the file is made on the phone from the user's own list) |
| Sharing, shopping lists, Buy buttons, manual edits | Yes | Yes |

The 20 links/hour and $3/day per-user limits from HAN-37 apply to both plans.

## Payments: in-app purchase through RevenueCat

StashtagAI ships through TestFlight / the App Store (`eas.json` has an App Store Connect app, `ascAppId 6832054633`) and
is planned for Google Play (`ai.stashtag.app`). Premium unlocks digital features inside the app, so Apple (App Review
Guideline 3.1.1) and Google Play billing policy require their in-app purchase. Stripe Checkout is only allowed for a
web-only app. RevenueCat (`react-native-purchases`) handles StoreKit and Play Billing with one API. It is free up to
about $2.5k a month in revenue. On the web, the paywall shows the prices and says to subscribe in the phone app. A
Premium account is Premium on the web too, because the server holds the plan.

## How it's enforced

Everything is checked on the server. The app only displays the result.

- `public.entitlements`: one row per account that has or had Premium. Users can read their own row and cannot write
  to it. Only two things write it: the `entitlements` function (`source 'revenuecat'`) and a manual grant in the SQL
  editor (`source 'manual'`). The function never overwrites a manual grant.
- `public.stash_usage`: one row per stash that reached `done` and filed something. `process-link` writes it.
  Deleting a stash doesn't give the allowance back. Lists added from a friend's share and "not sorted" runs don't count.
- `claim_stash_allowance` runs in `process-link` right after it claims a link and before any paid call. It fails
  closed. Over the limit, the link fails with `monthly_limit` (HTTP 429). The app then shows **See Premium** and
  **Try again**. Runs already in flight count, so a burst of links sent at once can't overshoot the cap.
- A trigger on `list_shares` refuses a new share past the plan's limit (`54000`). Lists already shared stay shared.
- `my_plan()` is what the paywall and Profile read: plan, this month's count, limits and reset date.
- `entitlements` function: RevenueCat's webhook, or the app right after a purchase or restore. Either way it asks
  RevenueCat's REST API with the secret key what the account owns. It never trusts the caller's word.

### Changing the numbers

They live in one row, so no migration or app release is needed:

```sql
update public.plan_limits set free_monthly_stashes = 20;   -- or premium_monthly_stashes, free_shared_lists, premium_shared_lists
```

### Giving someone Premium by hand (beta, support)

```sql
insert into public.entitlements (user_id, plan, source, expires_at)
values ((select id from auth.users where email = 'someone@example.com'), 'premium', 'manual', null)
on conflict (user_id) do update set plan = 'premium', source = 'manual', expires_at = excluded.expires_at, updated_at = now();
-- take it away: update public.entitlements set plan = 'free' where user_id = ...;
```

## Setup (board, before anyone can buy)

Nothing can be bought until all of these are done. **No live payments until the board confirms the final prices.**

1. **App Store Connect › StashtagAI › Subscriptions.** Create one subscription group, "Premium", with two
   auto-renewable products, for example `stashtag_premium_annual` ($34.99/year) and `stashtag_premium_monthly`
   ($4.99/month). Add a 7-day free-trial introductory offer to both. Fill in the review screenshot and description.
   The Paid Apps agreement and banking/tax details must be active. Optional: the Small Business Program (15% fee).
2. **RevenueCat** (free account): create a project and add the iOS app with its App Store Connect in-app purchase key.
   Create the entitlement **`premium`** (exact id), attach both products to it, and create the offering `default`
   with the **Annual** and **Monthly** packages.
3. **Webhook** (RevenueCat › Integrations › Webhooks): URL
   `https://qzaijqrkriuhlqbwmyto.supabase.co/functions/v1/entitlements`. Set the authorization header to
   `Bearer <a random string of 32+ characters>`.
4. **Supabase function secrets:**
   ```bash
   supabase secrets set REVENUECAT_SECRET_KEY=sk_...           # RevenueCat › API keys › secret key (v1)
   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<same random string as the webhook header, without "Bearer ">
   supabase secrets set REVENUECAT_ALLOW_SANDBOX=true          # only while testing in TestFlight; unset it at launch
   ```
5. **App keys** (EAS environment variables, so builds pick them up):
   ```bash
   bunx eas-cli env:create --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_... --environment production --environment preview --environment development --visibility plaintext
   ```
   Leave the key unset and the paywall shows the planned prices with buying turned off.

Sandbox purchases (TestFlight, sandbox Apple IDs) turn Premium on only while `REVENUECAT_ALLOW_SANDBOX=true`. Real
App Store purchases always count.

## Deploy

```bash
supabase db push                                         # migration 20261123232926_premium_entitlements
supabase functions deploy process-link                   # allowance check + usage ledger
supabase functions deploy entitlements --no-verify-jwt   # the webhook has no Supabase session; the function checks both callers
```

Apply the migration **before** deploying `process-link`. The new `process-link` fails closed with
`quota_unavailable` if `claim_stash_allowance` is missing.

`react-native-purchases` is native code, so the app needs a new build. An OTA update is not enough:

```bash
bunx eas-cli build --profile production --platform ios
bunx eas-cli submit --profile production --platform ios
```

## Not done yet

- No feature is behind "custom organization" yet. Renaming lists and categories was free before this and stays free.
  `my_plan().custom_organization` is ready for the first Premium-only organization feature.
- Android: needs the Play Console products and an `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. The code path is the same.
