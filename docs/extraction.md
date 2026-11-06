# Extraction pipeline (HAN-6)

Status: pipeline code + URL security + schema validation implemented and unit-tested.
**No accuracy or success rates are reported yet: no real IG/TikTok fixtures and no paid retrieval provider exist.** Nothing below is a measured rate.

## Flow
`links.id` -> `process-link` -> allowlist check -> resolve redirects (allowlist re-checked each hop) -> retrieval provider -> Claude extraction -> schema validation -> upsert category/list/items -> `links.status = done|failed`.

## Security
- `url.ts`: https only, exact host match against `instagram.com, www.instagram.com, tiktok.com, www.tiktok.com, vm.tiktok.com, m.tiktok.com`; no userinfo, no non-443 port; redirects followed manually (max 5), host re-checked at every hop. Tests in `test.ts`.
- Post text is passed to the model inside `<post>` tags with a system prompt marking it untrusted data; output is accepted only through `validateExtraction`.

## Output schema
`{kind: eats|trips|recipes|do, category, list_scope|null, tags[], items:[{name, description, address?, lat?, lng?}]}`.
Fields that fail validation are dropped, never guessed. lat/lng only kept as an in-range pair. Model is told to omit lat/lng; geocoding is a separate later step. Zero items -> `failed: no_items_found`.

## Retrieval options (unverified, from my own testing of a handful of URLs plus general knowledge)
| Option | Reliability | Cost | ToS / risk |
|---|---|---|---|
| TikTok oEmbed | Tried once: returned no title/author. Unproven. | free | official |
| Instagram oEmbed (Graph API) | Needs Meta app + review; returns no caption for most uses | free, account needed | official, heavy setup |
| Unauthenticated IG page/og fetch | Login shell, no caption in my test | free | against ToS if scaled |
| Third-party scraper API (Apify / ScrapeCreators style) | Unmeasured; typically returns caption, author, media URL | per-request pricing, unverified | scraping ToS grey area |
| Transcription (Whisper-class on downloaded audio) | needed for list-in-audio reels | per-minute | needs media URL from scraper |

**Recommendation (needs board decision):** a paid scraper provider for caption+media URL plus a transcription key, behind the `RetrievalProvider` interface (`retrieval.ts`). Only `oembedProvider` (TikTok, caption only) exists now.

## Open items
- `links/categories/lists/items` column names and unique constraints in `index.ts` are provisional until HAN-5 schema lands; `list_id,name`-style onConflict keys need matching unique indexes.
- Fixtures (10+ real public links with expected output, including iOS-shared links): blocked on board-supplied links.
- Run tests: `node --experimental-strip-types supabase/functions/process-link/test.ts`.
