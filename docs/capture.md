# Share, capture and review (HAN-7, approach 1A from HAN-11)

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
