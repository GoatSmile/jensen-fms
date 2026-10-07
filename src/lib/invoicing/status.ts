/**
 * Invoice lifecycle helpers — labels, badge variants, and the transition
 * matrix. Mirrors `src/lib/maintenance/work-order-status.ts` shape.
 *
 * Allowed transitions:
 *   draft   → issued | cancelled
 *   issued  → paid | overdue
 *   overdue → paid
 *   paid / credited / cancelled → (terminal; `credited` is written by the
 *   future credit-note flow, never by hand)
 *
 * Issuing is the point of no return: the invoice gets its sequential
 * INV number, `issued_locked_at` is stamped, and lines become immutable.
 * Danish bookkeeping wants issued numbers sequential and gapless — which
 * is why drafts carry a DRAFT-xxxx placeholder instead of consuming a
 * real number.
 */

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "overdue"
  | "credited"
  | "cancelled";

type BadgeVariant =
  | "default"
  | "secondary"
  | "warning"
  | "success"
  | "destructive"
  | "outline"
  | "ghost";

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  draft: "outline",
  issued: "default",
  paid: "success",
  overdue: "warning",
  credited: "secondary",
  cancelled: "destructive",
};

const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["issued", "cancelled"],
  issued: ["paid", "overdue"],
  overdue: ["paid"],
  paid: [],
  credited: [],
  cancelled: [],
};

export function validNextInvoiceStatuses(
  current: InvoiceStatus,
): InvoiceStatus[] {
  return TRANSITIONS[current] ?? [];
}

/**
 * Payment terms for a customer with none of its own (Dennis, 2026-10-07): a
 * PUBLIC customer — invoiced by EAN, or a municipality or hospital — pays at
 * 30 days; everyone else at 8. A figure on the customer always wins; NULL
 * means "follow this rule" (migration 123 dropped the column's old default of
 * 14, which nobody had chosen). Never hardcode a number elsewhere — call this.
 */
export const PUBLIC_PAYMENT_TERMS_DAYS = 30;
export const STANDARD_PAYMENT_TERMS_DAYS = 8;
const PUBLIC_SEGMENT_SLUGS = new Set(["municipality", "hospital"]);

export function resolvePaymentTermsDays(customer: {
  paymentTermsDays: number | null | undefined;
  eanNumber: string | null | undefined;
  segmentSlug: string | null | undefined;
}): number {
  if (customer.paymentTermsDays != null && customer.paymentTermsDays >= 0) {
    return customer.paymentTermsDays;
  }
  return isPublicCustomer(customer) ? PUBLIC_PAYMENT_TERMS_DAYS : STANDARD_PAYMENT_TERMS_DAYS;
}

function isPublicCustomer(c: { eanNumber: string | null | undefined; segmentSlug: string | null | undefined }): boolean {
  return Boolean(c.eanNumber?.trim()) || (c.segmentSlug != null && PUBLIC_SEGMENT_SLUGS.has(c.segmentSlug));
}

/** Round to whole øre — every kr. amount that hits the DB goes through this. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
