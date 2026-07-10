/**
 * Unwrap a PostgREST to-one embed. Depending on how supabase-js infers the
 * relationship, an embedded to-one relation is typed (and occasionally
 * returned) as a single object OR a one-element array — this normalizes both
 * to `T | null`. The one shared home for the pattern; don't hand-roll it
 * per file.
 */
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
