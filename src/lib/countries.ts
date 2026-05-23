/**
 * Country helpers. Storage stays ISO 3166-1 alpha-2 in the DB
 * (organizations.country_code is a 2-char field) — display becomes
 * the localized full name everywhere a customer or any reader looks
 * at it.
 *
 * Conversion uses the browser/Node-built-in `Intl.DisplayNames` so
 * we don't ship a 30 KB country-list dependency. Default locale is
 * English (the FMS operates in English) with a Danish fallback for
 * future i18n hooks.
 */

const DEFAULT_LOCALE = "en";
export const DEFAULT_COUNTRY_CODE = "DK";

/**
 * The list of ISO 3166-1 alpha-2 codes the Select dropdown offers.
 * Curated to push Jensen's home + neighbour markets to the top, then
 * EU + EEA + UK + common workshop neighbours, then everything else
 * sorted alphabetically by localized name. Anyone with an unlisted
 * country can still type their address — we just won't have a pin
 * accuracy advantage from the geocoder's country hint.
 *
 * The split shape (popular vs. rest) is exposed by `groupedCountries`
 * so the Select can render a divider between the two halves.
 */
const POPULAR_CODES: readonly string[] = [
  "DK",
  "SE",
  "NO",
  "DE",
  "NL",
  "GB",
  "FI",
  "IS",
  "FR",
  "BE",
  "CH",
  "AT",
  "PL",
  "ES",
  "IT",
  "US",
];

/**
 * Every ISO 3166-1 alpha-2 region code currently recognised by ICU.
 * Built once at module load. The list is deterministic across runs of
 * the same Node/V8 build, so SSR + hydration produce identical markup.
 */
function allRegionCodes(): readonly string[] {
  const out: string[] = [];
  // ISO codes are uppercase A–Z pairs. Enumerate AA..ZZ and keep the
  // ones DisplayNames recognises (it returns the code itself, not the
  // name, when the input isn't a real region).
  const display = new Intl.DisplayNames([DEFAULT_LOCALE], { type: "region" });
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = display.of(code);
      if (name && name !== code) out.push(code);
    }
  }
  return out;
}

const ALL_CODES = allRegionCodes();

export type CountryOption = {
  code: string;
  name: string;
};

/**
 * Lookup helper. Returns the localized country name, or the code
 * itself when ICU doesn't know it.
 */
export function countryName(
  code: string | null | undefined,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!code) return "";
  const upper = code.trim().toUpperCase();
  if (upper.length !== 2) return upper;
  try {
    const display = new Intl.DisplayNames([locale], { type: "region" });
    return display.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

/**
 * Two lists for the Select dropdown: popular markets (in the order
 * defined above, so DK lands first) and the rest alphabetised by
 * display name.
 */
export function groupedCountries(
  locale: string = DEFAULT_LOCALE,
): { popular: CountryOption[]; rest: CountryOption[] } {
  const popularSet = new Set(POPULAR_CODES);
  const popular: CountryOption[] = POPULAR_CODES.map((code) => ({
    code,
    name: countryName(code, locale),
  }));
  const rest: CountryOption[] = ALL_CODES.filter((c) => !popularSet.has(c))
    .map((code) => ({ code, name: countryName(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return { popular, rest };
}
