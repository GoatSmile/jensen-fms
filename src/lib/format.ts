/**
 * Shared price/money formatters. DKK uses Danish locale (`1.234,56 kr.`);
 * other currencies use a plain English-style `1,234.56 USD`.
 *
 * The Parts feature has its own richer `formatMoney` in `@/lib/parts/format`
 * — this lighter helper exists so the rest of the app doesn't pull in the
 * full parts module just to render a price.
 */

export function formatPrice(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null || Number.isNaN(amount) || !currency) return "—";
  if (currency.toUpperCase() === "DKK") {
    return `${new Intl.NumberFormat("da-DK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)} kr.`;
  }
  return `${new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency.toUpperCase()}`;
}

/**
 * Dual-currency render: the native amount plus its DKK equivalent.
 *
 *   formatPriceWithDkk(4.88, "EUR", 7.47)  →  "4,88 EUR (≈ 36,45 kr.)"
 *   formatPriceWithDkk(123, "DKK", null)   →  "123,00 kr."
 *
 * When `fxRateToDkk` is null/undefined and the currency isn't DKK, we
 * return the native value alone with no `(≈ ... kr.)` tail.
 */
export function formatPriceWithDkk(
  amount: number | null | undefined,
  currency: string | null | undefined,
  fxRateToDkk: number | null | undefined,
): string {
  if (amount == null || Number.isNaN(amount) || !currency) return "—";
  const native = formatPrice(amount, currency);
  if (currency.toUpperCase() === "DKK") return native;
  if (fxRateToDkk == null || !Number.isFinite(fxRateToDkk)) return native;
  const dkk = amount * fxRateToDkk;
  return `${native} (≈ ${formatPrice(dkk, "DKK")})`;
}

/**
 * Just the DKK side of a foreign-currency amount. Returns "—" when we
 * can't convert. Useful when there's no room to show both currencies.
 */
export function formatAsDkk(
  amount: number | null | undefined,
  currency: string | null | undefined,
  fxRateToDkk: number | null | undefined,
): string {
  if (amount == null || Number.isNaN(amount) || !currency) return "—";
  if (currency.toUpperCase() === "DKK") return formatPrice(amount, "DKK");
  if (fxRateToDkk == null || !Number.isFinite(fxRateToDkk)) return "—";
  return formatPrice(amount * fxRateToDkk, "DKK");
}

/**
 * Look up an FX rate from a `from_currency → DKK` map. Returns null if the
 * currency is missing from the map. DKK→DKK is implicit (1).
 */
export function lookupDkkRate(
  fxToDkk: Map<string, number>,
  currency: string | null | undefined,
): number | null {
  if (!currency) return null;
  const c = currency.toUpperCase();
  if (c === "DKK") return 1;
  return fxToDkk.get(c) ?? null;
}
