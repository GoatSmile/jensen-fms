/**
 * Formatters for the Parts feature. Danish locale throughout — `1.234,56 kr.`
 * for DKK, equivalent grouping/decimal for foreign currencies. Re-exported
 * pieces from stock.ts are kept there; this file owns currency-agnostic and
 * date helpers used across the part-detail sections.
 */

const dateTimeFormatter = new Intl.DateTimeFormat("da-DK", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter.format(d);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return dateTimeFormatter.format(d);
}

/**
 * Format a money amount with its currency code. Uses `Intl.NumberFormat` with
 * `style: "currency"`, which knows how to render DKK as `1.234,56 kr.`, USD as
 * `$1,234.56`, etc. Falls back to a plain numeric format if the currency code
 * is unknown to the runtime.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
  options?: { maximumFractionDigits?: number },
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const code = (currency ?? "DKK").toUpperCase();
  try {
    return new Intl.NumberFormat("da-DK", {
      style: "currency",
      currency: code,
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    }).format(amount);
  } catch {
    // Unknown currency — render the number with the code suffix.
    return `${new Intl.NumberFormat("da-DK", {
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    }).format(amount)} ${code}`;
  }
}

const signedQtyFormatter = new Intl.NumberFormat("da-DK", {
  signDisplay: "exceptZero",
  maximumFractionDigits: 2,
});

export function formatSignedQuantity(
  qty: number | null | undefined,
): string {
  if (qty == null || Number.isNaN(qty)) return "—";
  return signedQtyFormatter.format(qty);
}

const fxFormatter = new Intl.NumberFormat("da-DK", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});

export function formatFxRate(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return "—";
  return fxFormatter.format(rate);
}

const factorFormatter = new Intl.NumberFormat("da-DK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatFactor(factor: number | null | undefined): string {
  if (factor == null || Number.isNaN(factor)) return "—";
  return factorFormatter.format(factor);
}

/**
 * Human-friendly label for the inventory_movement_type enum.
 * Kept as a flat lookup so unknown values (future enum additions) fall through
 * to the raw value rather than blowing up.
 */
export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  received: "Received",
  consumed_build: "Consumed (build)",
  consumed_maintenance: "Consumed (maintenance)",
  returned_to_supplier: "Returned to supplier",
  adjustment: "Adjustment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  disposed: "Disposed",
};

export function movementTypeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return MOVEMENT_TYPE_LABEL[type] ?? type;
}
