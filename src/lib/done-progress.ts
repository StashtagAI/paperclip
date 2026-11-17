import { DONE_LABELS, type Kind } from '@/lib/types';

/** "3 of 8 tried", "All 8 cooked", or "None visited yet" (HAN-41). */
export function progressText(kind: Kind, done: number, total: number): string {
  const verb = DONE_LABELS[kind].toLowerCase();
  if (total > 0 && done >= total) return total === 1 ? `All ${verb}` : `All ${total} ${verb}`;
  if (done === 0) return `None ${verb} yet`;
  return `${done} of ${total} ${verb}`;
}

/** What VoiceOver/TalkBack says after a mark is saved, e.g. "Marked Odd Fellows tried. 3 of 8 tried." */
export function doneAnnouncement(kind: Kind, name: string, done: boolean, doneCount: number, total: number): string {
  const verb = DONE_LABELS[kind].toLowerCase();
  const what = done ? `Marked ${name} ${verb}.` : `${name} no longer marked ${verb}.`;
  return `${what} ${progressText(kind, doneCount, total)}.`;
}
