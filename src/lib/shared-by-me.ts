import type { SharedByMe } from '@/lib/data';

/** How "Shared by you" (HAN-75) words the lists the signed-in user has shared. */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Home row subtitle, e.g. "3 lists · 4 people". People are counted once even if they're on several lists. */
export function sharedByMeSummary(rows: SharedByMe[]): string {
  const people = new Set(rows.flatMap((s) => s.recipients)).size;
  return `${plural(rows.length, 'list')} · ${people === 1 ? '1 person' : `${people} people`}`;
}

/** Who a list is shared with, e.g. "With alex@example.com, sam@example.com". */
export function recipientsText(recipients: string[]): string {
  return recipients.length ? `With ${recipients.join(', ')}` : 'Not shared with anyone yet';
}

export const itemCount = (n: number) => plural(n, 'item');
