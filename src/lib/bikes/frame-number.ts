/**
 * Frame-number suggestion. Pattern: `JP-{year}-{code}-{seq}`, with a 3-digit
 * zero-padded sequence. `code` is currently sourced from `bike_types.slug`
 * (upper-cased) — the per-model frame code that used to live on `bike_models`
 * went away with the template-only refactor in migration 09.
 *
 * Suggestion only — the user can override the value before submit, and
 * `bike_identifier_types.frame_number` does not have a `format_regex` so
 * anything goes.
 *
 * Sequence is computed by scanning every frame number already taken with the
 * `JP-{year}-{code}-` prefix and adding 1. The lookup is **global across all
 * MOs** because the uniqueness constraint on `bikes.frame_number` is
 * table-wide — scoping to a single MO let two MOs both pick `001` and the
 * second insert blew up on the unique constraint (caught in production on
 * bulk-add against a new MO).
 *
 * "Already taken" means BOTH tables. A frame number is written twice — onto
 * `bikes.frame_number` and as a `bike_identifiers` row — and
 * `uq_bike_identifiers_type_value` is unique per (type, value) over every row,
 * active or not. Scanning bikes alone therefore proposes numbers the identifier
 * table already owns: seen 2026-09-02, when bikes renamed with the TEST prefix
 * left their old identifiers behind and a spawned MO aborted half-created on
 * `JP-2026-E_BIKE-035`. Any correction made outside the app, any import, any
 * deactivated identifier row plants the same mine, so the generator reads both
 * sides rather than trusting them to agree.
 *
 * If two operators race they get the same suggestion; the UNIQUE constraint
 * blocks the second submit and they pick a different number.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type FrameNumberSuggestionInput = {
  year: number;
  code: string | null;
  /** Existing frame numbers in the same prefix. */
  existing: string[];
};

export function framePrefix(year: number, code: string | null): string {
  const upperCode = code?.trim().toUpperCase() ?? "";
  return upperCode === "" ? `JP-${year}-` : `JP-${year}-${upperCode}-`;
}

export function nextFrameNumberSuggestion({
  year,
  code,
  existing,
}: FrameNumberSuggestionInput): string {
  const prefix = framePrefix(year, code);

  let max = 0;
  for (const fn of existing) {
    if (!fn.startsWith(prefix)) continue;
    const tail = fn.slice(prefix.length);
    // Accept anything that ends in digits — tolerates suffixes like "-RC"
    const m = /^(\d+)/.exec(tail);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const next = String(max + 1).padStart(3, "0");
  return `${prefix}${next}`;
}

/**
 * Every frame number already spoken for under this prefix, from BOTH places it
 * can be written: the bike row and the identifier row. Soft-deleted bikes and
 * inactive identifiers count — the unique index covers them too, so a number
 * they hold is unavailable however dead the record looks.
 *
 * One call, used by every suggester so the two paths cannot drift.
 */
export async function loadUsedFrameNumbers(
  supabase: SupabaseClient,
  prefix: string,
): Promise<string[]> {
  const [bikesRes, idsRes] = await Promise.all([
    supabase.from("bikes").select("frame_number").like("frame_number", `${prefix}%`),
    supabase
      .from("bike_identifiers")
      .select("identifier_value, type:bike_identifier_types!inner(slug)")
      .eq("type.slug", "frame_number")
      .like("identifier_value", `${prefix}%`),
  ]);
  return [
    ...((bikesRes.data ?? []) as { frame_number: string | null }[]).map(
      (b) => b.frame_number ?? "",
    ),
    ...((idsRes.data ?? []) as { identifier_value: string | null }[]).map(
      (i) => i.identifier_value ?? "",
    ),
  ].filter(Boolean);
}

/**
 * Server-side helper: the next free frame number under the
 * `JP-{year}-{code}-` prefix (across ALL MOs, since uniqueness is global).
 * Pre-pend `extra` to plan a batch without round-tripping the DB for each step.
 */
export async function nextFrameNumberFromDb(
  supabase: SupabaseClient,
  args: { year: number; code: string | null; extra?: string[] },
): Promise<string> {
  const prefix = framePrefix(args.year, args.code);
  const existing = [
    ...(await loadUsedFrameNumbers(supabase, prefix)),
    ...(args.extra ?? []),
  ];
  return nextFrameNumberSuggestion({
    year: args.year,
    code: args.code,
    existing,
  });
}
