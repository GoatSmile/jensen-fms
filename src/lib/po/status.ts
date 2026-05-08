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

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  placed: "Placed",
  partially_received: "Partial",
  received: "Received",
  cancelled: "Cancelled",
};

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

export function poStatusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return PO_STATUS_LABEL[s as PurchaseOrderStatus] ?? s;
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
