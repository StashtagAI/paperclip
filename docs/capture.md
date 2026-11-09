# Share, capture and review (HAN-7, approach 1A from HAN-11; link-first since HAN-18)

> **Since HAN-18 (2026-11-09) the link comes first.** On **Stash it**, `process-link` reads the post's caption
> server-side. The capture screen below is now the fallback. See [Link-first capture](#link-first-capture-han-18).

**Status:** typecheck, lint, unit tests and the web export pass. `expo prebuild` generates the iOS share extension and
the Android intent filter. **Nothing native has been compiled or run yet**: there is no Xcode or Android SDK on the build
machine. The Swift/Kotlin in `modules/media-extract`, OCR speed and whisper speed/accuracy all need a development build
on a real phone. No speed or accuracy numbers have been measured.

## Flow

1. **Share sheet:** Instagram/TikTok › Share › Stashtag. The iOS share extension (expo-share-intent) only passes the
   link to the app and opens it. No OCR runs in the extension, because iOS limits extension memory. Android receives a
   `text/*` SEND intent.
   `src/app/+native-intent.ts` → `/share` → `checkLink` → `/stash?url=…` saves the `links` row (`pending`).
2. **Capture** (`/capture/[linkId]`): **Add screenshots**, **Add screen recording**, **Paste caption**. Each source
   shows as an editable text block with its source and timings.
3. **Build card:** the app calls `process-link` directly with the signed-in user's session:
   `POST {link_id, captured: {caption?, transcript?, ocr?}}`. Only text is sent; screenshots and recordings stay on the
   phone.
4. **Review** (`/card/[linkId]`): live status (Realtime on the `links` row), then each item with the source of every
   field (`from the post`, `from a linked site`, `from Google Places`, `from web search`, with the site's host). Wrong
   items can be removed, and there is a thumbs up/down (`link_feedback`).

Web gets **Paste caption** and **Upload screenshots** only. Screenshots are read in the browser with tesseract.js.

## Link-first capture (HAN-18)

The board reversed approach 1A on 2026-11-09 ("I want the smoothest experience for users") and accepted the Instagram
terms-of-service risk.

1. **Stash it** (paste or share sheet) saves the link, calls `process-link` with only `{link_id}` (no `captured`), and
   opens the card screen with `sent=read`.
2. `process-link` claims the link (`processing`, `raw_content.reading = true`; the card shows **Reading the post…**) and
   runs `fetch-caption.ts`, with a 30 s budget:
   - **TikTok:** resolves `vm.tiktok.com` short links (redirects are followed only on allowlisted hosts), then calls the
     public oEmbed endpoint (`https://www.tiktok.com/oembed?url=…`, no key) and uses `title` as the caption. **As of
     2026-11-09 oEmbed returned no `title` for every video we tried**, so with `APIFY_TOKEN` set it falls back to the
     Apify actor `clockworks~tiktok-scraper` (input `postURLs`, caption in `text`, downloads off).
   - **Instagram:** Apify actor `apify~instagram-scraper`, input
     `{directUrls:[url], resultsType:"posts", resultsLimit:1}`, caption in `caption`. Private, deleted and
     login-walled posts come back as an item with `error`.
   - Apify is called with `POST /v2/acts/<actor>/run-sync-get-dataset-items?timeout=27&maxItems=1&maxTotalChargeUsd=0.05`,
     with the token in the `Authorization` header. Billing is capped at one result.
3. If a caption comes back, it goes into the same `captured.caption` field the capture screen uses (the payload agreed
   with Extraction in HAN-6). Extraction runs as usual, and `raw_content` gets `caption_source: "fetched"` and
   `fetch: {via, ms, cost_usd}`. The review screen labels those fields **from the caption (fetched)**.
4. If anything fails (kill switch, no token, private post, empty caption, timeout, actor error), or the fetched caption
   names no items, the link goes back to `pending` with `error = "needs_capture"`. `raw_content` keeps
   `fetch.reason` and any caption. The card screen then opens **Add what the post says**, which shows the reason and
   pre-fills the fetched caption as a **Caption (fetched)** block. The link is never marked `failed` for a fetch problem.

**Kill switches** (Supabase Edge Function secrets; unset means on):

| Secret | Effect |
| --- | --- |
| `LINK_FETCH_ENABLED=false` | No fetching at all: every link goes straight to the capture screen. |
| `LINK_FETCH_INSTAGRAM=false` / `LINK_FETCH_TIKTOK=false` | Turns one platform off. |
| `APIFY_TOKEN` | Required for Instagram, and for TikTok when oEmbed has no caption. Without it, Instagram falls back to capture. |

`bunx supabase secrets set LINK_FETCH_ENABLED=false` (or the dashboard: Edge Functions › Secrets) takes effect on the
next call, with no redeploy.

**Cost and time per fetch** are written to `process_events` (stage `fetch_caption`: `ms`, `ok`, `detail.via`,
`detail.cost_usd`, `detail.reason`, `detail.tried`) and to the function log, and on success also to
`links.raw_content.fetch`. `cost_usd` is an estimate: results returned × the actor's list price per result on the
free plan (Instagram $2.70 / 1,000, TikTok $1.70 / 1,000, checked on apify.com 2026-11-09). It is not Apify's
invoice. TikTok via oEmbed costs $0.

```sql
select created_at, ok, ms, detail->>'via' via, detail->>'reason' reason, (detail->>'cost_usd')::numeric cost
from process_events where stage = 'fetch_caption' order by created_at desc limit 50;
```

Not in this task: server-side audio transcription for posts with an empty caption.

## Decision: trigger = direct call from the client (deliverable 1)

The captured text exists only on the phone, so a DB webhook or trigger on `links` insert would have nothing to send.
The client inserts the link, collects the text, then calls the function itself. Consequences:

- `process-link` checks that the caller's JWT belongs to the link owner (`verify_jwt` alone accepts the anon key), and
  claims the link atomically (`status <> 'processing'`), so a double tap returns 409 instead of starting a second run.
- If the app dies between insert and call, the link stays `pending`. Home shows it as "Add what the post says", and
  tapping it reopens capture. Links stuck in `processing` are failed after 5 minutes by `sweep_stuck_links()` (HAN-6).
- Re-sharing a saved post reopens capture for the existing link. Building the card again re-runs extraction and merges.

## Merging into existing lists (deliverable 2)

In `supabase/functions/process-link/merge.ts`, category, list and item names match case- and whitespace-insensitively.
A second Denver restaurants post goes into the existing Restaurants › Denver list. Items already there are left as they
were (not duplicated, not overwritten), and their names are stored in `raw_content.already_listed`, which the review
screen shows. List tags are unioned.

## Package choices (checked against npm and docs on Nov 8, 2026, Expo SDK 58)

| Need | Package | Why / notes |
| --- | --- | --- |
| Share sheet | `expo-share-intent` 9.x | README lists 9.0+ for SDK 58. Config plugin adds the iOS share extension (`ai.stashtag.app.share-extension`, app group `group.ai.stashtag.app`) and Android `SEND text/*`. No patch-package step since v6. |
| OCR | `expo-text-extractor` 2.x | Apple Vision on iOS; on Android `play-services-mlkit-text-recognition` 19.0.1 (ML Kit Text Recognition v2, Latin). `extractTextFromImage(uri) → string[]`. |
| Pick media | `expo-image-picker` ~58 | System picker lists newest first; `orderedSelection` numbers the picks. Only the photo-library permission is requested. |
| Paste | `expo-clipboard` ~58 | |
| Frames + audio from recordings | local module `modules/media-extract` | `expo-video-thumbnails` is deprecated ("not receiving patches"), and `expo-video` thumbnails are image refs without a file URI, so OCR can't read them. Nothing in the SDK exports an audio track. The module uses AVAssetImageGenerator/AVAssetReader on iOS and MediaMetadataRetriever/MediaExtractor+MediaCodec on Android. It writes 1 fps JPEG frames (max 90, 1600 px) and a 16 kHz mono 16-bit WAV (max 10 min). |
| Speech to text | `whisper.rn` 0.7 | whisper.cpp on device; needs 16 kHz 16-bit PCM WAV (hence the module above). Model `ggml-base.en-q5_1.bin` (57 MB), downloaded on first use from Hugging Face, pinned to commit `5359861c`, size-checked. Imported as `whisper.rn/index` because its `exports` map has no root entry. `expo-speech-recognition` (iOS Speech / Android) is the fallback if whisper is too slow. It needs the same WAV conversion. |
| Model download | `expo-file-system` ~58 | `File.createDownloadTask` with progress. |
| Web OCR | `tesseract.js` 7 | Lazy-loaded; downloads its wasm core and English data from its CDN on first use. |

## Open / to measure on a real phone (HAN-8)

- OCR time per screenshot, frames per recording, whisper time for a 30–60 s reel, and transcript accuracy on a spoken
  recipe. The app shows these timings on each capture block, so they can be read off the screen.
- The review happens after `process-link` has saved the items. The user can remove wrong items, but there is no
  "discard everything" or field editing yet. A true pre-save review needs a dry-run mode in `process-link`.
