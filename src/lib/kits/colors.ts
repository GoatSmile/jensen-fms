/**
 * Sticker-colour palette for kits ("Red 1", "Green 9" — the box labels the
 * assembly floor picks by). A fixed app-side palette, not a DB table: print
 * colours are a presentation concern, and a short list of visually distinct,
 * printable colours keeps the physical stickers consistent. `fg` is the text
 * colour that stays readable on the sticker band.
 */
export const KIT_STICKER_COLORS = [
  { slug: "red", label: "Red", hex: "#dc2626", fg: "#ffffff" },
  { slug: "green", label: "Green", hex: "#16a34a", fg: "#ffffff" },
  { slug: "blue", label: "Blue", hex: "#2563eb", fg: "#ffffff" },
  { slug: "yellow", label: "Yellow", hex: "#eab308", fg: "#171717" },
  { slug: "orange", label: "Orange", hex: "#ea580c", fg: "#ffffff" },
  { slug: "purple", label: "Purple", hex: "#9333ea", fg: "#ffffff" },
  { slug: "pink", label: "Pink", hex: "#db2777", fg: "#ffffff" },
  { slug: "teal", label: "Teal", hex: "#0d9488", fg: "#ffffff" },
  { slug: "brown", label: "Brown", hex: "#92400e", fg: "#ffffff" },
  { slug: "black", label: "Black", hex: "#171717", fg: "#ffffff" },
] as const;

export type KitStickerColorSlug = (typeof KIT_STICKER_COLORS)[number]["slug"];

const FALLBACK = { slug: "grey", label: "Grey", hex: "#6b7280", fg: "#ffffff" };

/** Palette entry for a colour slug; unknown slugs fall back to grey. */
export function stickerColor(slug: string | null | undefined) {
  return KIT_STICKER_COLORS.find((c) => c.slug === slug) ?? FALLBACK;
}

/**
 * Display code for a kit: ("red", 1) → "Red 1". The number is optional —
 * ("red", null) → just "Red" (a bare-colour code). Full-code picking either
 * way: the printed sticker carries exactly this string.
 */
export function kitCode(
  colorSlug: string | null | undefined,
  number: number | null | undefined,
): string {
  if (!colorSlug) return "—";
  const label = stickerColor(colorSlug).label;
  return number == null ? label : `${label} ${number}`;
}

/**
 * Canonical kit ordering: colour A→Z, then bare colour before numbered
 * ("Red" < "Red 1" < "Red 2"). Use everywhere kits are sorted so pickers,
 * chips, and pick lists agree.
 */
export function compareKits(
  a: { sticker_color: string; kit_number: number | null },
  b: { sticker_color: string; kit_number: number | null },
): number {
  if (a.sticker_color !== b.sticker_color)
    return a.sticker_color.localeCompare(b.sticker_color);
  return (a.kit_number ?? 0) - (b.kit_number ?? 0);
}
