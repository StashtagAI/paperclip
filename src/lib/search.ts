/**
 * PostgREST `or` filter for search: item name contains the query (case-insensitive), or the
 * query is one of the item's tags. Returns null for an empty query.
 */
export function itemSearchFilter(query: string): string | null {
  const q = query.trim().replace(/^#+/, '');
  if (!q) return null;
  // Escape LIKE wildcards, then quote for PostgREST (backslash-escape `\` and `"`) so commas,
  // dots and parens in the query can't change the filter.
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`.replace(/[\\"]/g, (c) => `\\${c}`);
  const clauses = [`name.ilike."${like}"`];
  const tag = q.toLowerCase();
  if (/^[\p{L}\p{N}_-]+$/u.test(tag)) clauses.push(`tags.cs.{${tag}}`);
  return clauses.join(',');
}
