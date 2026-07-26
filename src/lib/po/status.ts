/**
 * Purchase-order status presentation. The enum lives in Postgres; this module
 * owns the human label and badge variant used in the UI.
 */

export type PurchaseOrderStatus =
  | "draft"
  | "placed"
  | "partially_received"
  | "received"
  | "cancelled";

export const PO_STATUS_VARIANT: Record<
  PurchaseOrderStatus,
  "default" | "secondary" | "warning" | "success" | "destructive" | "outline"
> = {
  draft: "outline",
  placed: "secondary",
  partially_received: "warning",
  received: "success",
  cancelled: "destructive",
};

/**
 * Statuses considered "open" — i.e. still in play in the workshop. A PO that's
 * draft, placed, or partially received hasn't reached a terminal state.
 */
export const OPEN_PO_STATUSES: PurchaseOrderStatus[] = [
  "draft",
  "placed",
  "partially_received",
];

/**
 * Allowed transitions for the user-facing "Move to" dropdown.
 *
 *   draft               → placed | cancelled
 *   placed              → cancelled         (receive flow handles partial/full)
 *   partially_received  → cancelled
 *   received            → (terminal)
 *   cancelled           → (terminal)
 *
 * The receive-form is the only path that advances a PO into
 * `partially_received` or `received`; this dropdown deliberately doesn't
 * expose those targets to avoid a divergent code path.
 */
const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ["placed", "cancelled"],
  placed: ["cancelled"],
  partially_received: ["cancelled"],
  received: [],
  cancelled: [],
};

export function validNextPOStatuses(
  current: PurchaseOrderStatus,
): PurchaseOrderStatus[] {
  return PO_TRANSITIONS[current] ?? [];
}

/** Cancellation always wants a reason in the audit trail. */
export function poTransitionRequiresReason(
  to: PurchaseOrderStatus,
): boolean {
  return to === "cancelled";
}

/**
 * Decide the new status from line totals. We only ever advance status here:
 * a fully-received PO won't roll back to partial because of a clerical fix.
 * Cancelled is sticky.
 */
export function computeStatusFromLines(
  current: PurchaseOrderStatus,
  lines: Array<{ quantity: number; received_quantity: number }>,
): PurchaseOrderStatus {
  if (current === "cancelled") return current;
  if (lines.length === 0) return current;
  const totalOrdered = lines.reduce((s, l) => s + l.quantity, 0);
  const totalReceived = lines.reduce((s, l) => s + l.received_quantity, 0);
  if (totalReceived === 0) return current === "draft" ? "draft" : "placed";
  if (totalReceived >= totalOrdered) return "received";
  return "partially_received";
}
