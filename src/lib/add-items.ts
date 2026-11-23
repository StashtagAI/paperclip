import type { AddCandidate } from '@/lib/data';
import type { Kind } from '@/lib/types';

/** What a list holds, for button and status text: "place", "recipes". */
export function itemNoun(kind: Kind, n: number): string {
  const word = kind === 'eats' || kind === 'travel' ? 'place' : kind === 'recipes' ? 'recipe' : 'item';
  return n === 1 ? word : `${word}s`;
}

export type AddSection = { key: string; title: string; items: AddCandidate[] };

/**
 * The user's items that can be added to a list (HAN-125), by "Category › List", A–Z: not ones whose name the list
 * already has (any case; the database would skip them), and only those whose name or description matches `query`.
 */
export function addableSections(candidates: AddCandidate[], listNames: string[], query: string): AddSection[] {
  const taken = new Set(listNames.map((n) => n.toLocaleLowerCase()));
  const q = query.trim().toLocaleLowerCase();
  const sections = new Map<string, AddSection>();
  for (const item of candidates) {
    if (taken.has(item.name.toLocaleLowerCase())) continue;
    if (q && !`${item.name}\n${item.description}`.toLocaleLowerCase().includes(q)) continue;
    const title = `${item.list.category.name} › ${item.list.name}`;
    const section = sections.get(item.list.id) ?? { key: item.list.id, title, items: [] };
    section.items.push(item);
    sections.set(item.list.id, section);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  return [...sections.values()]
    .map((s) => ({ ...s, items: s.items.sort((a, b) => byName(a.name, b.name)) }))
    .sort((a, b) => byName(a.title, b.title));
}

/** What to announce after adding: "Added 2 recipes to Weeknight." plus any skipped as already there. */
export function addedMessage(result: { added: number; skipped: number }, list: string, kind: Kind): string {
  const added = result.added
    ? `Added ${result.added} ${itemNoun(kind, result.added)} to ${list}.`
    : `Nothing new was added to ${list}.`;
  const skipped = result.skipped
    ? ` ${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} already in it.`
    : '';
  return added + skipped;
}
