/**
 * A LINE on a customer-facing commercial document — today an offer or a sales
 * order. Their line tables are column-identical (migration 09): a line
 * references EITHER a part (spare / accessory) OR a `bike_template` (a complete
 * bike, optionally in a colour), and prices it with a VAT code.
 *
 * PURCHASE-ORDER lines are deliberately NOT this shape. They are supplier-side
 * and carry fx rate, transport, tariff and anti-dumping instead of VAT, with no
 * template and no colour — so `/purchase-orders` keeps its own lines UI rather
 * than being bent into this one.
 *
 * This module is PURE — no Supabase, no React, no next-intl — so a server page,
 * a server action and a client component can all import it. The writer lives in
 * `./write-lines.ts` (server only, because it holds the translator type).
 */

export type LineKind = "part" | "template";

/** One line's user-supplied values, parsed and validated. */
export type CommercialLineValues = {
  kind: LineKind;
  part_id: string | null;
  bike_template_id: string | null;
  quantity: number;
  unit_price: number;
  vat_code: string | null;
  color_id: string | null;
  description_en: string | null;
  description_da: string | null;
};

/** One line as the table renders it. Document-specific extras (an SO's linked
 *  MOs, an offer's picture) are NOT here — they ride on the render slots the
 *  shared section exposes, so this stays the same shape for both documents. */
export type CommercialLineRow = {
  id: string;
  lineNumber: number;
  kind: LineKind;
  partId: string | null;
  partSku: string | null;
  partName: string | null;
  bikeTemplateId: string | null;
  templateLabel: string | null;
  colorId: string | null;
  colorName: string | null;
  quantity: number;
  unitPrice: number;
  vatCode: string | null;
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  descriptionEn: string | null;
  descriptionDa: string | null;
};

/** Values the edit dialog opens with. */
export type LineDialogInitial = {
  lineId: string;
  kind: LineKind;
  partId: string | null;
  bikeTemplateId: string | null;
  quantity: number;
  unitPrice: number;
  vatCode: string | null;
  colorId: string | null;
  descriptionEn: string | null;
  descriptionDa: string | null;
};

/** The result every line writer returns, shared so the client dialog can type
 *  its `onSubmit` prop without importing the server-only writer. */
export type CommercialLineResult = { ok: true } | { ok: false; error: string };

/* ── Picker choices ────────────────────────────────────────────────────────
 * Defined here rather than in the client dialog so a SERVER page can import
 * them without type-importing across the "use client" boundary — the boundary
 * that silently empties VALUE imports (see CLAUDE.md).
 */

export type PartChoice = {
  id: string;
  internal_sku: string;
  name_en: string;
  /** As on TemplateChoice — a spare on an offer is priced the same way. */
  default_retail_price: number | null;
  default_retail_currency: string | null;
};

export type TemplateChoice = {
  id: string;
  name_en: string;
  family: string | null;
  /** FK to bike_families — drives the family's app-wide tint dot. */
  family_id: string | null;
  /** Admin-set family sort_order (page-side family-adjacent ordering). */
  family_sort: number | null;
  frame_size: string | null;
  /**
   * List price, and the currency it is quoted in. BOTH are needed: the price
   * is a bare number, so offering it on a document in another currency would
   * silently quote EUR figures as DKK. Same guard as `draft-writers.ts`.
   */
  default_retail_price: number | null;
  default_retail_currency: string | null;
};

export type VatCodeChoice = {
  code: string;
  name_en: string;
  name_da?: string | null;
  default_rate: number;
};

export type ColorChoice = {
  id: string;
  name_en: string;
  name_da?: string | null;
  hex: string | null;
  ral_code: string | null;
  coating: string | null;
};

/** NUMERIC(15,4) is the column scale — money is stored at 4dp and rounded for
 *  display only, so the stored figure never drifts from the sum of its parts. */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Line money from quantity × unit price at a VAT RATE IN PERCENT (`vat_rate`
 * is stored as e.g. `25`, not `0.25` — unlike the purchasing percentages,
 * which are decimals). Returned unrounded; the writer rounds to 4dp, the
 * dialog preview to 2.
 */
export function computeLineMoney(
  quantity: number,
  unitPrice: number,
  vatRatePct: number,
): { subtotal: number; vat: number; total: number } {
  const subtotal = quantity * unitPrice;
  const vat = subtotal * (vatRatePct / 100);
  return { subtotal, vat, total: subtotal + vat };
}

/** Sum of line money, for the parent document's stored totals. */
export function sumLineMoney(
  lines: {
    line_subtotal: number | null;
    line_vat_amount: number | null;
    line_total: number | null;
  }[],
): { subtotal: number; vat: number; total: number } {
  let subtotal = 0;
  let vat = 0;
  let total = 0;
  for (const l of lines) {
    subtotal += Number(l.line_subtotal ?? 0);
    vat += Number(l.line_vat_amount ?? 0);
    total += Number(l.line_total ?? 0);
  }
  return { subtotal: round4(subtotal), vat: round4(vat), total: round4(total) };
}

/**
 * The list price to put on a line for a catalogue item, or null when there
 * isn't one to offer.
 *
 * GUARDED ON CURRENCY, and that is the whole point: `default_retail_price` is a
 * bare number with its currency in a sibling column, so offering a EUR-priced
 * template on a DKK document would quote the figure unconverted and understate
 * the line by the exchange rate. A missing currency is read as DKK, the same
 * assumption `draft-writers.ts` makes.
 */
export function retailPriceIn(
  item:
    | {
        default_retail_price: number | null;
        default_retail_currency: string | null;
      }
    | null
    | undefined,
  documentCurrency: string,
): number | null {
  if (!item || item.default_retail_price == null) return null;
  const priced = (item.default_retail_currency ?? "DKK").toUpperCase();
  if (priced !== documentCurrency.toUpperCase()) return null;
  const n = Number(item.default_retail_price);
  return Number.isFinite(n) ? n : null;
}
