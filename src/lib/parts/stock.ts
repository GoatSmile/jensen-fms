/**
 * Stock + cost helpers for the Parts feature.
 *
 * Stock thresholds (per spec):
 *   - 0          → "out"  (red / destructive)
 *   - ≤ 20% of last purchase qty → "low" (amber / warning)
 *   - else       → "ok"   (green / success)
 *
 * If we have no last-purchase reference qty, we can only detect "out" vs "ok".
 */

export type StockStatus = "ok" | "low" | "out";

export function getStockStatus(
  quantityOnHand: number,
  lastPurchaseQuantity: number | null | undefined,
): StockStatus {
  if (quantityOnHand <= 0) return "out";
  if (
    lastPurchaseQuantity != null &&
    lastPurchaseQuantity > 0 &&
    quantityOnHand <= lastPurchaseQuantity * 0.2
  ) {
    return "low";
  }
  return "ok";
}

export const STOCK_BADGE_VARIANT: Record<
  StockStatus,
  "success" | "warning" | "destructive"
> = {
  ok: "success",
  low: "warning",
  out: "destructive",
};

export const STOCK_BADGE_LABEL: Record<StockStatus, string> = {
  ok: "In stock",
  low: "Low",
  out: "Out",
};

/**
 * Format a numeric DKK value using Danish locale conventions.
 * Returns "—" for null/undefined so we don't render "0,00 kr" for missing data.
 */
const dkkFormatter = new Intl.NumberFormat("da-DK", {
  style: "currency",
  currency: "DKK",
  maximumFractionDigits: 2,
});

export function formatDkk(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return dkkFormatter.format(amount);
}

/**
 * Format an integer-ish stock quantity. We always show stock as a whole number
 * unless the part stocks fractional units (rare); the underlying column is
 * numeric so we play it safe and trim trailing zeros.
 */
const qtyFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 2,
});

export function formatQuantity(qty: number | null | undefined): string {
  if (qty == null || Number.isNaN(qty)) return "—";
  return qtyFormatter.format(qty);
}
