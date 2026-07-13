/**
 * Locale-aware display name for a controlled-vocabulary row that carries a
 * bilingual name pair (name_en / name_da, display_name_en / display_name_da,
 * label_en / label_da, …).
 *
 * The active locale picks the primary value; the other language fills in when
 * the primary is blank, so a partially-translated vocab never renders empty.
 * Pure and synchronous — callers supply the locale: server components/actions
 * via `await getLocale()`, client components via `useLocale()` (both from
 * next-intl). Entity names the shop authors in one language on purpose (part
 * names, bike-template names, organisation display names) are NOT vocab and
 * deliberately don't go through here.
 */
export function localizedName(
  locale: string,
  en: string | null | undefined,
  da: string | null | undefined,
): string {
  return (locale === "da" ? da || en : en || da) ?? "";
}
