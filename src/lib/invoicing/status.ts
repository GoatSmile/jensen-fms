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

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  overdue: "Overdue",
  credited: "Credited",
  cancelled: "Cancelled",
};

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

export function invoiceStatusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return INVOICE_STATUS_LABEL[s as InvoiceStatus] ?? s;
}

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

/** Default payment terms until per-org terms exist: net 14 days. */
export const DEFAULT_PAYMENT_TERMS_DAYS = 14;

/** Round to whole øre — every kr. amount that hits the DB goes through this. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
