import type { MoveResult } from '@/lib/data';

/** "Moved to Restaurants › Denver." plus what was combined or left behind (HAN-124). */
export function moveSummary(path: string, { merged, skipped }: MoveResult): string {
  const parts = [`Moved to ${path}.`];
  if (merged === 1) parts.push('1 was already there, so the two copies were combined.');
  else if (merged) parts.push(`${merged} were already there, so the copies were combined.`);
  if (skipped === 1) parts.push('1 has photos on both copies, so it stayed where it was.');
  else if (skipped) parts.push(`${skipped} have photos on both copies, so they stayed where they were.`);
  return parts.join(' ');
}
