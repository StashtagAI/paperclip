/** A tag without its leading #, lower-cased, so "#Sushi" and "sushi" match. */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').toLowerCase();
}

/** What a list item needs for tag filtering: its own tags and those of the post it came from (HAN-6 tags links). */
export type TaggedItem = { tags: string[]; link?: { tags: string[] } | null };

/** Every tag an item carries, normalized: the list's #tags are the union of its posts' tags, so this is the match set. */
export function itemTags(item: TaggedItem): Set<string> {
  return new Set([...item.tags, ...(item.link?.tags ?? [])].map(normalizeTag).filter(Boolean));
}

/** The items tagged `tag`, or all of them when no tag is picked. */
export function filterByTag<T extends TaggedItem>(items: T[], tag: string | null): T[] {
  if (!tag) return items;
  const want = normalizeTag(tag);
  return items.filter((i) => itemTags(i).has(want));
}

/**
 * The list's tags that match at least one item, with how many. A tag whose posts were all deleted would filter to
 * nothing, so it isn't offered. Most-shared first (ties keep the list's order); duplicates that differ only by # or
 * case collapse.
 */
export function tagCounts(listTags: string[], items: TaggedItem[]): { tag: string; count: number }[] {
  const sets = items.map(itemTags);
  const seen = new Set<string>();
  const out: { tag: string; count: number }[] = [];
  for (const raw of listTags) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    const count = sets.filter((s) => s.has(tag)).length;
    if (count) out.push({ tag, count });
  }
  return out.sort((a, b) => b.count - a.count);
}
