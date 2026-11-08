# Extraction pipeline (HAN-6, scope per HAN-11 approach 1A)

**Status:** the captured-text path works end to end on *synthetic fixture text* with a mocked model (`test.ts`). It has not been run against the live Claude API, a live database, or real Instagram/TikTok posts. **No accuracy or success rates are reported; none have been measured.**

## Decision: no server-side fetching of Instagram/TikTok
Instagram's oEmbed terms bar extracting/storing content, and scrapers are against both platforms' ToS. The server therefore never fetches the post. The phone captures text (OCR, transcript, pasted caption) and sends it.

## Request contract (agreed on HAN-7; client side in `docs/capture.md`)
`POST process-link {link_id, captured: {caption?, transcript?, ocr?}}`, called by the app with the user's session; the caller must own the link (else 404), and a link already `processing` returns 409. Each field is a string, clipped to 20k chars; at least one is required (`no_captured_text` otherwise). The source URL is read from `links.url` and re-validated against the host allowlist (`url.ts`); it is only validated, never fetched.

## Flow
`links.id` -> allowlist check -> status `processing` -> linked-site reader -> Claude extraction -> schema validation -> grounding -> optional lookup -> upsert category/list/items -> `links.status = done|failed`.

## Linked-site reader (`linked.ts`)
Finds up to 3 URLs in the captured text and reads schema.org JSON-LD (`Recipe`, `Restaurant`, `CafeOrCoffeeShop`, `BarOrPub`, `Bakery`, `FoodEstablishment`, `Place`, `LocalBusiness`, `TouristAttraction`, `Park`, `Museum`). Guards: https only, no IP literals / localhost / internal names / non-443 ports, Instagram/TikTok/Facebook hosts never fetched, redirects followed manually (3 max) with the check repeated per hop, 5 s timeout, 1 MB cap, HTML only. **Residual risk:** DNS names that resolve to private IPs are not blocked, because Edge Functions give no pre-connect hook. Network egress controls would close this.

## Extraction and grounding (`extract.ts`)
Captured text and linked data go to Claude inside `<post>` / `<linked_site>` tags, marked untrusted. Output must pass `validateExtraction`, then `ground()`:
- An item survives only if its name appears in the captured text or matches a linked-site entity.
- The model's lat/lng are always discarded. Coordinates come only from linked-site data or a lookup provider.
- Address is kept only if it appears in the captured text, or comes from linked-site data.
- Recipe ingredients/steps come from the linked page, or from the model only if every line appears in the captured text.
- Each field records its source: `capture`, `linked_site`, `places_lookup` or `search`.

Output shape: `{kind: eats|trips|recipes|do, category, list_scope|null, tags[], items:[{name, description, address?, lat?, lng?, ingredients?, steps?, sources}]}`. Zero items -> `failed: no_items_found`.

## Place lookups (`lookup.ts`)
`LookupProvider` has `findPlace(name, hint)` and optional `geocode(address)`. `lookupFromEnv` returns the Google provider when the Edge Function secret **`GOOGLE_PLACES_API_KEY`** is set (`Deno.env.get`), otherwise the no-op `stubLookup`. The pipeline then runs as before, with no address or map pin on the cards. The key is never committed, logged, or sent to the client.
- **Named place without an address:** Places API (New) `places:searchText` over HTTPS, `pageSize: 1`, query `"<name> <list_scope>"`. The key is sent in `X-Goog-Api-Key` and the field mask is `places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri`. Result accepted only if the returned display name matches the queried name (`namesMatch`); otherwise the fields stay empty.
- **Address already in the text or linked data:** the Geocoding API fills lat/lng only if exactly one result is returned. The stated address is never replaced.
- **One lookup per card:** an item gets either a Text Search or a Geocoding call, never both. **Cache:** hits are stored in `place_lookups` (migration `20261108190000_place_lookups.sql`, keyed by normalized name + list scope, with the place id), so re-running a link does not call Google again. Misses are not cached.
- **Website is not requested.** `websiteUri` is in a higher-priced Places SKU than the current mask, so it stays out unless the board accepts the cost.
- Recipes are never looked up. Fields filled this way carry `source: places_lookup`.
- Web search (`source: search`) is approved (board, Nov 8) and implemented in `search.ts` with Claude's server-side `web_search_20260209` tool on the existing `ANTHROPIC_API_KEY`.
  - Runs only for gaps: recipes missing ingredients or steps, and places still without an address after the Places lookup. One request per card with `max_uses: 3`; no retries, and a `pause_turn` is treated as a miss.
  - Search results are untrusted. A filled field is accepted only if the model returns a `source_url` that the search tool actually returned; it is stored in `item_source_urls` in `links.raw_content`.
  - Hits are cached in `search_lookups` (migration `20261108200000`, not applied to the live DB). Cache errors never fail a card.
  - Kill switch: Edge Function secret `WEB_SEARCH_ENABLED=false` (also `0`, `off`, `no`) turns it off without a deploy. Default is on when `ANTHROPIC_API_KEY` is set.
  - Cost logging: one line per link, `web_search count=N cards=K/M` (counts only, no content).
- Cost and hit rate are unmeasured: the provider is tested with a mocked `fetch` only, not the live Google API.

## Storage
`items` has no column for recipe details or per-field sources. Until Fullstack adds them (suggest `items.details jsonb`, `items.field_sources jsonb`), they are written to `links.raw_content` as `recipe_details` and `item_sources`, keyed by item name. Only `name, description, address, lat, lng` go to `items`.

## Open items
- Real fixtures: need captured text from real public posts (incl. iOS-shared) with expected output, to measure accuracy.
- Live test with the Anthropic key and a deployed function.

Run tests: `node --experimental-strip-types supabase/functions/process-link/test.ts`

## Logging, feedback and timeout (HAN-6)

- `process_events`: one row per stage (`captured`, `linked_sites`, `extract`, `places`, `search`, `final`) with `ok`, `ms` and a small `detail` json. Detail holds counts, lengths and item names only (including names dropped by grounding and the model output length). Never secrets or full captions. Users can read their own rows; the app may insert `source='client'` rows for diagnostics.
- `link_feedback`: one row per (link, user). `rating` up/down, `reason` (wrong_category | wrong_items | missed_items, only with down), optional `note`. A trigger fills `snapshot` with the extracted items so feedback matches the output.
- `sweep_stuck_links()` runs every minute via pg_cron: links `pending`/`processing` for more than 5 minutes become `failed` with `error='timeout'` and a `sweep` event.
