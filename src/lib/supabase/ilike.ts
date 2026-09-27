/**
 * Make user text safe to interpolate into a PostgREST `.or()` filter STRING
 * as an ilike needle. Two hazards, both handled here:
 *  1. LIKE wildcards (% _) and backslash — escaped so a stray char can't
 *     match everything.
 *  2. The or()-grammar chars (comma = OR-separator, parens = grouping) —
 *     replaced with a % wildcard so a customer name like "Jensen, Inc." or
 *     "Hotel (København)" neither breaks nor injects the filter, and still
 *     matches (the wildcard spans the removed punctuation).
 *
 * Column-method filters (`.ilike(col, v)`) are encoded by the client and need
 * only (1); `.or()` strings need both.
 */
export function ilikeEscape(q: string): string {
  return q
    .replace(/[%_\\]/g, (m) => `\\${m}`)
    .replace(/[(),]/g, "%");
}
