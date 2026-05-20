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
