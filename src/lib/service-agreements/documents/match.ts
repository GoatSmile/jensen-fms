/**
 * Frame numbers read off an agreement → bikes. Deterministic CODE, not the
 * model (the inbound rule): an exact match, after normalising, is a match; a
 * near miss is only ever a SUGGESTION a person picks, never a tick. Pure — the
 * caller loads the bikes and the active lines.
 *
 * Normalising: upper case, no spaces, dots or dashes. The register splits a
 * frame over three cells and people type it with or without the gaps, so
 * "WAB 1906617395 C", "wab-1906617395-c" and "WAB1906617395C" are one frame.
 */

export type MatchBike = {
  id: string;
  frame_number: string;
  status: string;
  owner_organization_id: string | null;
  owner_unit_id: string | null;
  owner_name: string | null;
};

export type ActiveLineInfo = {
  line_id: string;
  agreement_id: string;
  agreement_name: string;
};

export type FrameMatchKind =
  /** One of this customer's bikes. */
  | "customer"
  /** A bike in the system that belongs to someone else. */
  | "other_customer"
  /** A bike in the system with no owner (in build, in stock). */
  | "no_owner"
  /** Nothing matches exactly. */
  | "not_found";

export type FrameMatch = {
  raw: string;
  description: string | null;
  kind: FrameMatchKind;
  bike: MatchBike | null;
  /** The bike's current active line, if it has one. */
  activeLine: ActiveLineInfo | null;
  /** Near misses for a `not_found` frame — likely misreads, for a person to pick. */
  suggestions: MatchBike[];
};

export function normaliseFrame(s: string): string {
  return s.toLocaleUpperCase("da-DK").replace(/[\s.\-_/]/g, "");
}

/** Characters a scan or a hand misreads for each other. */
const CONFUSABLE: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6" };

function canonical(s: string): string {
  return [...s].map((c) => CONFUSABLE[c] ?? c).join("");
}

/** Levenshtein distance, stopping early above `max`. */
function distanceAtMost(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function isNear(paper: string, bike: string): boolean {
  if (paper.length < 5 || bike.length < 5) return false;
  const a = canonical(paper);
  const b = canonical(bike);
  if (a === b) return true;
  // The paper may drop the prefix or the trailing year letter.
  if ((b.endsWith(a) || b.startsWith(a) || a.endsWith(b) || a.startsWith(b)) && Math.abs(a.length - b.length) <= 3)
    return true;
  return distanceAtMost(a, b, 1) <= 1;
}

export function matchFrames(
  frames: { frame_number: string; description: string | null }[],
  bikes: MatchBike[],
  activeLines: Map<string, ActiveLineInfo>,
  organizationId: string,
): FrameMatch[] {
  const byFrame = new Map<string, MatchBike>();
  for (const b of bikes) byFrame.set(normaliseFrame(b.frame_number), b);
  const customerBikes = bikes.filter((b) => b.owner_organization_id === organizationId);
  const claimed = new Set<string>();

  const out: FrameMatch[] = frames.map((f) => {
    const key = normaliseFrame(f.frame_number);
    const bike = byFrame.get(key) ?? null;
    if (bike) claimed.add(bike.id);
    const kind: FrameMatchKind = !bike
      ? "not_found"
      : bike.owner_organization_id === organizationId
        ? "customer"
        : bike.owner_organization_id
          ? "other_customer"
          : "no_owner";
    return {
      raw: f.frame_number,
      description: f.description,
      kind,
      bike,
      activeLine: bike ? (activeLines.get(bike.id) ?? null) : null,
      suggestions: [],
    };
  });

  // Near misses: the customer's own bikes first (the likely place), then the
  // whole fleet — and never a bike another frame on the paper already matched.
  for (const m of out) {
    if (m.kind !== "not_found") continue;
    const key = normaliseFrame(m.raw);
    const pick = (pool: MatchBike[]) =>
      pool.filter((b) => !claimed.has(b.id) && isNear(key, normaliseFrame(b.frame_number))).slice(0, 3);
    m.suggestions = pick(customerBikes);
    if (m.suggestions.length === 0) m.suggestions = pick(bikes);
  }
  return out;
}
