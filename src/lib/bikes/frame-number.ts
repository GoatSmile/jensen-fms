/**
 * Frame-number suggestion. Pattern: `JP-{year}-{model.frame_number_code}-{seq}`,
 * with a 3-digit zero-padded sequence. Suggestion only — the user can override
 * the value before submit, and `bike_identifier_types.frame_number` does not
 * have a `format_regex` so anything goes.
 *
 * Sequence is computed by counting bikes whose frame_number starts with the
 * `JP-{year}-{code}-` prefix and adding 1. Cheap query and good enough for
 * a single shop. If two operators race they get the same suggestion; the
 * UNIQUE constraint on bike_identifier_types(frame_number, value) blocks the
 * second submit and they pick a different number.
 */

export type FrameNumberSuggestionInput = {
  year: number;
  code: string | null;
  /** Existing frame numbers in the same prefix. */
  existing: string[];
};

export function nextFrameNumberSuggestion({
  year,
  code,
  existing,
}: FrameNumberSuggestionInput): string {
  const upperCode = code?.trim().toUpperCase() ?? "";
  const prefix = upperCode === "" ? `JP-${year}-` : `JP-${year}-${upperCode}-`;

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
