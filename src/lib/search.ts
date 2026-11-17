/** The query without a leading #, trimmed. */
function clean(query: string): string {
  return query.trim().replace(/^#+/, '');
}

/** An ILIKE "contains" pattern for the query with LIKE wildcards escaped, or null for an empty query. */
export function likePattern(query: string): string | null {
  const q = clean(query);
  return q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
}

/**
 * PostgREST `or` filter for search: name contains the query (case-insensitive), or the query is one of the row's tags.
 * Used for items and lists, which both have `name` and `tags`. Returns null for an empty query.
 */
export function itemSearchFilter(query: string): string | null {
  const like = likePattern(query);
  if (!like) return null;
  // Quote for PostgREST (backslash-escape `\` and `"`) so commas, dots and parens in the query can't change the filter.
  const clauses = [`name.ilike."${like.replace(/[\\"]/g, (c) => `\\${c}`)}"`];
  const tag = clean(query).toLowerCase();
  if (/^[\p{L}\p{N}_-]+$/u.test(tag)) clauses.push(`tags.cs.{${tag}}`);
  return clauses.join(',');
}
