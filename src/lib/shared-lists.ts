import type { KindCategory, SharedWithMe } from '@/lib/data';
import { sharerName } from '@/lib/display-name';
import type { Kind } from '@/lib/types';

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/**
 * Files the lists shared with the user under their own categories of the same name (HAN-125): a friend's Recipes ›
 * Dinners › Weeknight sits in the user's own Dinners, matched case-insensitively as process-link matches names. A
 * shared list whose category the user doesn't have gets a category of its own, marked `sharedOnly`. Categories stay
 * A–Z, and so do the lists in each.
 */
export function withSharedLists(categories: KindCategory[], shared: SharedWithMe[], kind: Kind): KindCategory[] {
  const mine = shared.filter((s) => s.kind === kind);
  if (!mine.length) return categories;
  const out = new Map(categories.map((c) => [c.name.toLocaleLowerCase(), { ...c, lists: [...c.lists] }]));
  for (const s of mine) {
    const key = s.category.toLocaleLowerCase();
    let category = out.get(key);
    if (!category) {
      category = { id: `shared:${key}`, kind, name: s.category, lists: [], sharedOnly: true };
      out.set(key, category);
    }
    category.lists.push({
      id: s.list_id,
      category_id: category.id,
      name: s.list,
      tags: [],
      itemCount: s.item_count,
      doneCount: 0,
      sharedBy: sharerName(s.shared_by),
    });
  }
  return [...out.values()]
    .map((c) => ({ ...c, lists: c.lists.sort((a, b) => byName(a.name, b.name)) }))
    .sort((a, b) => byName(a.name, b.name));
}
