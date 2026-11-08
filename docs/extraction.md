# Extraction pipeline (HAN-6, scope per HAN-11 approach 1A)

**Status:** the captured-text path works end to end on *synthetic fixture text* with a mocked model (`test.ts`). It has not been run against the live Claude API, a live database, or real Instagram/TikTok posts. **No accuracy or success rates are reported; none have been measured.**

## Decision: no server-side fetching of Instagram/TikTok
Instagram's oEmbed terms bar extracting/storing content, and scrapers are against both platforms' ToS. The server therefore never fetches the post. The phone captures text (OCR, transcript, pasted caption) and sends it.

## Request contract (proposed; to agree with Fullstack on HAN-7)
`POST process-link {link_id, captured: {caption?, transcript?, ocr?}}`. Each field is a string, clipped to 20k chars; at least one is required (`no_captured_text` otherwise). The source URL is read from `links.url` and re-validated against the host allowlist (`url.ts`); it is only validated, never fetched.

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
- Each field records its source: `capture`, `linked_site` or `search`.

Output shape: `{kind: eats|trips|recipes|do, category, list_scope|null, tags[], items:[{name, description, address?, lat?, lng?, ingredients?, steps?, sources}]}`. Zero items -> `failed: no_items_found`.

## Paid lookups (`lookup.ts`)
Places/web search are not approved. `LookupProvider` is an interface with a no-op `stubLookup`; the pipeline fills missing place addresses/coords from it (tagged `search`) when a real provider is injected. No accounts opened.

## Storage
`items` has no column for recipe details or per-field sources. Until Fullstack adds them (suggest `items.details jsonb`, `items.field_sources jsonb`), they are written to `links.raw_content` as `recipe_details` and `item_sources`, keyed by item name. Only `name, description, address, lat, lng` go to `items`.

## Open items
- Real fixtures: need captured text from real public posts (incl. iOS-shared) with expected output, to measure accuracy.
- Live test with the Anthropic key and a deployed function.
- Agree the payload on HAN-7.

Run tests: `node --experimental-strip-types supabase/functions/process-link/test.ts`
