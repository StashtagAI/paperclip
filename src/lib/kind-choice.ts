import { type Kind, KINDS, type RawContent } from '@/lib/types';

export type KindChoice = { current: Kind; alt: Kind };

/**
 * The two kinds to offer on the card when process-link wasn't sure (HAN-87): where the post's items were filed, and the
 * runner-up it stored in `raw_content.alt_kind`. Null when there's nothing to ask: no runner-up (clear, or already
 * answered), one this app version doesn't know, or no items of this post to move.
 */
export function kindChoice(raw: RawContent | null, current: Kind | undefined): KindChoice | null {
  const alt = raw?.alt_kind;
  if (!current || !alt || alt === current || !(KINDS as readonly string[]).includes(alt)) return null;
  return { current, alt: alt as Kind };
}
