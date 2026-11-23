import type { LinkStatus } from '@/lib/types';

// How a link that didn't make it to a card is shown, and what "Try again" does (HAN-77).

export const FAILED_TITLE = 'Couldn’t build this card';

/**
 * A link process-link finished ("done") without filing anything (HAN-89). It's in no list, so Home keeps it until the
 * user files it under a kind or dismisses it.
 */
export const NOT_SORTED_TITLE = 'Not sorted';
export const NOT_SORTED_REASON = 'Nothing in it could be sorted into a list';

/** Done, no items from this post, and none skipped as already in their list (link_overview.not_sorted). */
export function isNotSorted(status: LinkStatus, itemCount: number, alreadyListed: number): boolean {
  return status === 'done' && itemCount === 0 && alreadyListed === 0;
}

/** The status word for a stash in a list of stashes. Text, so it never relies on its colour. */
export function linkStatusLabel(link: { status: LinkStatus; not_sorted?: boolean | null }): string {
  if (link.not_sorted) return NOT_SORTED_TITLE;
  return { pending: 'Needs text', processing: 'Processing', done: 'Filed', failed: 'Failed' }[link.status];
}

/**
 * The card screen sent the request but the row never left "pending": the request didn't reach process-link (offline,
 * the function didn't start). Not a server code; the card screen gives up waiting after `START_TIMEOUT_MS`.
 */
export const NOT_STARTED = 'not_started';
export const START_TIMEOUT_MS = 30_000;

/** process-link's `links.error` codes, plus `not_started`, as one sentence for the screen and screen readers. */
const ERROR_COPY: Record<string, string> = {
  no_captured_text: 'No text reached the server. Add a screenshot or paste the caption.',
  no_items_found: 'No places, recipes or things to do were named in the text.',
  timeout: 'This took too long and was stopped.',
  url_not_allowed: 'Only Instagram and TikTok links are supported.',
  [NOT_STARTED]: 'Couldn’t reach the server. Check your connection and try again.',
  // Usage limits (HAN-37)
  rate_limited: 'You’ve added a lot of links in the last hour. Try this one again in a little while.',
  daily_limit: 'Today’s limit for building cards is reached. Try this one again tomorrow.',
  // Free-tier monthly allowance (HAN-132); Premium's fair-use ceiling uses the same code.
  monthly_limit: 'You’ve used this month’s AI stashes. Premium lifts the limit, or try again when it resets on the 1st.',
  run_budget: 'This post needed more lookups than one card is allowed. Try adding less text.',
  quota_unavailable: 'Something went wrong on our side. Try again in a minute.',
};

/** Why it failed, in words. Codes without copy (new or internal ones) get a generic line rather than the raw code. */
export function failureReason(error: string | null | undefined): string {
  return (error && ERROR_COPY[error]) || 'Something went wrong while reading it.';
}

/** Failures caused by the text itself: reading the post again gives the same text, so ask for different text. */
const NEEDS_NEW_TEXT = new Set(['no_captured_text', 'no_items_found', 'run_budget']);

/**
 * What "Try again" does for a link in this state: `rerun` sends it to process-link again from the card screen (the
 * caption is read again; if that fails the card screen moves on to the capture screen), `capture` opens the capture
 * screen for new text, `upgrade` offers Premium (HAN-132), null means there's nothing to retry. `sent` is the card screen's param: "1" means the text came
 * from the capture screen, and that text only lived on the phone, so a request that never started needs it again.
 */
export function retryAction(status: LinkStatus, error: string | null | undefined, sent?: string): 'rerun' | 'capture' | 'upgrade' | null {
  if (error === NOT_STARTED) return sent === '1' ? 'capture' : 'rerun';
  if (status !== 'failed') return null;
  if (error === 'url_not_allowed') return null;
  // Over the monthly allowance (HAN-132): offer Premium; the card screen also keeps Try again for after upgrading or
  // the reset.
  if (error === 'monthly_limit') return 'upgrade';
  return error && NEEDS_NEW_TEXT.has(error) ? 'capture' : 'rerun';
}

type Tracked = { id: string; status: LinkStatus; error: string | null; post: string; not_sorted?: boolean | null };

/**
 * What to read out when a list of not-yet-filed links is re-read (Home, HAN-77): links that were being sorted and have
 * now failed, finished with nothing filed (HAN-89), or left the list because they were filed. Null when nothing settled.
 */
export function settledMessage(before: readonly Tracked[], after: readonly Tracked[]): string | null {
  const now = new Map(after.map((l) => [l.id, l]));
  const lines = before
    .filter((l) => l.status === 'processing')
    .flatMap((l) => {
      const next = now.get(l.id);
      if (!next) return [`Sorted: ${l.post}`];
      if (next.status === 'failed') return [`${FAILED_TITLE}: ${l.post}. ${failureReason(next.error)}`];
      if (next.not_sorted) return [`${NOT_SORTED_TITLE}: ${l.post}. ${NOT_SORTED_REASON}`];
      return [];
    });
  return lines.length ? lines.join('. ') : null;
}
