import type { LinkDetail } from '@/lib/types';

/** What happens to a link, in order (HAN-42). process-link names the step it's on in `links.raw_content.stage`. */
export const STEPS = [
  { key: 'saved', label: 'Got your link', detail: '' },
  { key: 'reading', label: 'Reading the post', detail: 'Fetching the caption from Instagram or TikTok.' },
  {
    key: 'finding',
    label: 'Finding the places, recipes and things to do',
    detail: 'Only what the post actually names makes the cut.',
  },
  { key: 'filing', label: 'Sorting them into your lists', detail: 'Looking up addresses and map pins.' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

/**
 * The step a card is on while it's being built, or null once it isn't (done, failed, waiting for text). The link is
 * already saved when the card screen opens, so the first step is always done. `sending` is the card screen's "the
 * request is on its way" state; `sent` its param: "read" after Stash it (the caption is fetched next), "1" after the
 * capture screen (the text is already in). Rows written before process-link reported `stage` fall back to `reading`.
 */
export function currentStep(
  link: Pick<LinkDetail, 'status' | 'raw_content'>,
  sending: boolean,
  sent?: string,
): StepKey | null {
  if (link.status === 'pending') return sending ? (sent === 'read' ? 'reading' : 'finding') : null;
  if (link.status !== 'processing') return null;
  const raw = link.raw_content;
  if (raw?.stage && STEPS.some((s) => s.key === raw.stage)) return raw.stage;
  return raw?.reading ? 'reading' : 'finding';
}

/** "Step 2 of 4: Reading the post", shown above the steps and read out when the step changes. */
export function stepAnnouncement(step: StepKey) {
  const i = STEPS.findIndex((s) => s.key === step);
  return `Step ${i + 1} of ${STEPS.length}: ${STEPS[i].label}`;
}
