// Merge rules for filing a new post into existing lists (HAN-7): names match case- and whitespace-insensitively, so a
// second "restaurants in denver" post lands in Restaurants > Denver and never re-adds a place that is already there.

export const nameKey = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** The existing row whose name matches `name`, if any. */
export function findByName<T extends { name: string }>(rows: readonly T[], name: string): T | undefined {
  const key = nameKey(name);
  return rows.find((r) => nameKey(r.name) === key);
}

/** Splits extracted items into ones to insert and names already in the list; also drops repeats within the batch. */
export function splitNew<T extends { name: string }>(items: readonly T[], existingNames: readonly string[]) {
  const seen = new Set(existingNames.map(nameKey));
  const fresh: T[] = [];
  const already: string[] = [];
  for (const it of items) {
    const key = nameKey(it.name);
    if (seen.has(key)) {
      if (existingNames.some((n) => nameKey(n) === key)) already.push(it.name);
      continue;
    }
    seen.add(key);
    fresh.push(it);
  }
  return { fresh, already };
}
