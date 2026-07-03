/**
 * Paint SCOPE — what gets painted on a frame, which drives the JP-lak price.
 * Kept as an app constant (like coatings) — a small, stable, painter-facing
 * vocabulary. The two values mirror the JP-lak service SKUs:
 *   std  = frame + fork
 *   svaj = frame + fork + front carrier + mudguards + sign + stays
 *
 * Scope lives per line on paint_order_bikes.scope (nullable = unspecified).
 */
export const PAINT_SCOPES = ["std", "svaj"] as const;
export type PaintScope = (typeof PAINT_SCOPES)[number];

export function isPaintScope(v: unknown): v is PaintScope {
  return v === "std" || v === "svaj";
}

const SCOPE_LABELS: Record<PaintScope, { en: string; da: string }> = {
  std: { en: "Frame + fork", da: "Stel + forgaffel" },
  svaj: { en: "Full (svajer)", da: "Fuld (svajer)" },
};

const SCOPE_PARTS: Record<PaintScope, { en: string; da: string }> = {
  std: { en: "frame, fork", da: "stel, forgaffel" },
  svaj: {
    en: "frame, fork, front carrier, mudguards, sign, stays",
    da: "stel, forgaffel, frontlad, skærme, skilt, stiver",
  },
};

/** Short label for a scope; null for unspecified. */
export function paintScopeLabel(
  scope: string | null | undefined,
  lang: "en" | "da" = "en",
): string | null {
  if (!isPaintScope(scope)) return null;
  return SCOPE_LABELS[scope][lang];
}

/** Spelled-out included-parts list for the painter; null for unspecified. */
export function paintScopeParts(
  scope: string | null | undefined,
  lang: "en" | "da" = "en",
): string | null {
  if (!isPaintScope(scope)) return null;
  return SCOPE_PARTS[scope][lang];
}

/**
 * Resolve the JP-lak service SKU for a line from its scope and the order's
 * total bike count (the JP-lak SKUs bundle a volume tier 1/10/20 with the
 * std/svaj scope). Returns e.g. "JP-lak10 svaj". Null when scope is unset.
 *
 * Tiers: >=20 -> lak20, >=10 -> lak10, else lak1. The price is a per-bike rate;
 * a mixed-scope order resolves each line independently against the SAME tier.
 */
export function resolveLakSku(
  scope: string | null | undefined,
  bikeCount: number,
): string | null {
  if (!isPaintScope(scope)) return null;
  const tier = bikeCount >= 20 ? "20" : bikeCount >= 10 ? "10" : "1";
  return `JP-lak${tier} ${scope}`;
}
