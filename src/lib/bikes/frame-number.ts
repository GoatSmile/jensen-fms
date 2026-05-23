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
 * Sequence is computed by scanning bikes whose frame_number starts with the
 * `JP-{year}-{code}-` prefix and adding 1. The lookup is **global across all
 * MOs** because the uniqueness constraint on `bikes.frame_number` is
 * table-wide — scoping to a single MO let two MOs both pick `001` and the
 * second insert blew up on the unique constraint (caught in production on
 * bulk-add against a new MO).
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
 * Server-side helper: query every existing frame_number sharing the
 * `JP-{year}-{code}-` prefix (across ALL MOs, since uniqueness is global)
 * and feed them into the suggester. Pre-pend `extra` to plan a batch
 * without round-tripping the DB for each step.
 */
export async function nextFrameNumberFromDb(
  supabase: SupabaseClient,
  args: { year: number; code: string | null; extra?: string[] },
): Promise<string> {
  const prefix = framePrefix(args.year, args.code);
  const { data } = await supabase
    .from("bikes")
    .select("frame_number")
    .like("frame_number", `${prefix}%`);

  const existing = [
    ...(data ?? []).map((b) => b.frame_number as string),
    ...(args.extra ?? []),
  ];
  return nextFrameNumberSuggestion({
    year: args.year,
    code: args.code,
    existing,
  });
}
