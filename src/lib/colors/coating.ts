/**
 * Coating / finish vocabulary for `colors.coating`. Kept as an app constant
 * (not a DB table) — small, stable list the colour form offers as a picker.
 * The column is free text, so values outside this list are tolerated but not
 * surfaced in the picker.
 */
export const COATINGS = ["matte", "glossy", "clear", "satin"] as const;
export type Coating = (typeof COATINGS)[number];

const LABELS: Record<string, { en: string; da: string }> = {
  matte: { en: "Matte", da: "Mat" },
  glossy: { en: "Glossy", da: "Blank" },
  clear: { en: "Clear", da: "Klar" },
  satin: { en: "Satin", da: "Satin" },
};

/** Human label for a coating token; falls back to a capitalised token. */
export function coatingLabel(
  coating: string | null | undefined,
  lang: "en" | "da" = "en",
): string | null {
  if (!coating) return null;
  const known = LABELS[coating];
  if (known) return known[lang];
  return coating.charAt(0).toUpperCase() + coating.slice(1);
}

/**
 * Compact "RAL 9005 · Matte" descriptor for a colour, omitting empty parts.
 * Returns null when neither a RAL code nor a coating is set.
 */
export function colorFinishLabel(
  ralCode: string | null | undefined,
  coating: string | null | undefined,
  lang: "en" | "da" = "en",
): string | null {
  const parts = [ralCode?.trim() || null, coatingLabel(coating, lang)].filter(
    Boolean,
  );
  return parts.length ? parts.join(" · ") : null;
}
