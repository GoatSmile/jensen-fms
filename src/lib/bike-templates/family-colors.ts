/**
 * Gentle colour-coding for bike-template families ("Norma" is always the
 * same hue everywhere: templates list, detail chip, MO batch cards, pickers,
 * family admin). Presentation-only — deliberately NOT a DB column: eight
 * soft hues assigned by hashing the family id, so a family keeps its colour
 * across renames and sort-order changes, and no one has to manage a colour
 * picker. Collisions are fine (groups are always labelled); the palette just
 * makes scanning faster. Mirrors the app-constant approach of
 * `src/lib/kits/colors.ts`.
 *
 * Every class string is a full Tailwind literal (JIT can't see computed
 * names). `dot` is the small saturated marker; `header` tints a group-card
 * header band; `chip` styles a rounded family badge.
 *
 * DELIBERATELY EXEMPT from the six-hue token vocabulary in CLAUDE.md, and the
 * only such palette in `src/` — the same exemption the kit sticker colours
 * carry. These hues are decorative identity, not meaning: a family is not
 * "an alert", and routing them through the semantic tokens both lies about
 * intent and collapses eight distinguishable colours onto six (the 2026-07-26
 * sweep did exactly that and made two families identical). If you are here to
 * replace these with tokens, don't.
 */

export type FamilyTint = {
  dot: string;
  header: string;
  chip: string;
};

const PALETTE: FamilyTint[] = [
  {
    dot: "bg-sky-500",
    header: "bg-sky-50/70 dark:bg-sky-500/10",
    chip: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  },
  {
    dot: "bg-emerald-500",
    header: "bg-emerald-50/70 dark:bg-emerald-500/10",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  {
    dot: "bg-amber-500",
    header: "bg-amber-50/70 dark:bg-amber-500/10",
    chip: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  },
  {
    dot: "bg-violet-500",
    header: "bg-violet-50/70 dark:bg-violet-500/10",
    chip: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
  },
  {
    dot: "bg-rose-500",
    header: "bg-rose-50/70 dark:bg-rose-500/10",
    chip: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  },
  {
    dot: "bg-cyan-500",
    header: "bg-cyan-50/70 dark:bg-cyan-500/10",
    chip: "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300",
  },
  {
    dot: "bg-lime-500",
    header: "bg-lime-50/70 dark:bg-lime-500/10",
    chip: "border-lime-200 bg-lime-50 text-lime-900 dark:border-lime-500/30 dark:bg-lime-500/10 dark:text-lime-300",
  },
  {
    dot: "bg-fuchsia-500",
    header: "bg-fuchsia-50/70 dark:bg-fuchsia-500/10",
    chip: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300",
  },
];

/** Neutral look for "Ungrouped" / templates with no family. */
export const UNGROUPED_TINT: FamilyTint = {
  dot: "bg-muted-foreground/40",
  header: "bg-muted/40",
  chip: "border-border bg-muted/40 text-muted-foreground",
};

/**
 * Tint for a family id. Null/undefined (no family) gets the neutral look.
 * Plain char-code hash — stable, order-independent, good enough spread for
 * a handful of families.
 */
export function familyTint(familyId: string | null | undefined): FamilyTint {
  if (!familyId) return UNGROUPED_TINT;
  let h = 0;
  for (let i = 0; i < familyId.length; i++) {
    h = (h * 31 + familyId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
