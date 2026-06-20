/**
 * Paint-order lifecycle helpers — labels, badge variants, allowed transitions.
 *
 * Allowed transitions:
 *   planned         → sent_to_painter | cancelled
 *   sent_to_painter → at_painter | received_back | cancelled
 *   at_painter      → received_back | cancelled
 *   received_back   → (terminal)
 *   cancelled       → (terminal)
 *
 * `received_back` and `cancelled` are terminal. Cancellation is allowed from
 * any non-terminal state.
 */

export type PaintOrderStatus =
  | "planned"
  | "sent_to_painter"
  | "at_painter"
  | "received_back"
  | "cancelled";

export const PAINT_ORDER_STATUS_LABEL: Record<PaintOrderStatus, string> = {
  planned: "Planned",
  sent_to_painter: "Sent to painter",
  at_painter: "At painter",
  received_back: "Received back",
  cancelled: "Cancelled",
};

export const PAINT_ORDER_STATUS_VARIANT: Record<
  PaintOrderStatus,
  "default" | "secondary" | "warning" | "success" | "destructive" | "outline"
> = {
  planned: "outline",
  sent_to_painter: "secondary",
  at_painter: "warning",
  received_back: "success",
  cancelled: "destructive",
};

export function paintOrderStatusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return PAINT_ORDER_STATUS_LABEL[s as PaintOrderStatus] ?? s;
}

const TRANSITIONS: Record<PaintOrderStatus, PaintOrderStatus[]> = {
  planned: ["sent_to_painter", "cancelled"],
  sent_to_painter: ["at_painter", "received_back", "cancelled"],
  at_painter: ["received_back", "cancelled"],
  received_back: [],
  cancelled: [],
};

export function validNextPaintOrderStatuses(
  current: PaintOrderStatus,
): PaintOrderStatus[] {
  return TRANSITIONS[current] ?? [];
}

/** Statuses that count as "open" (still in flight). */
export const OPEN_PAINT_ORDER_STATUSES: PaintOrderStatus[] = [
  "planned",
  "sent_to_painter",
  "at_painter",
];

export function isPaintOrderOpen(s: string | null | undefined): boolean {
  if (!s) return false;
  return OPEN_PAINT_ORDER_STATUSES.includes(s as PaintOrderStatus);
}

/**
 * Statuses where a bike is physically AWAY at the painter and so can't be
 * built (Tier 2 Phase C / D2). Narrower than OPEN_PAINT_ORDER_STATUSES: a
 * `planned` order hasn't shipped yet, so its bikes are still buildable.
 * `received_back` frees the frames automatically — a bike simply stops
 * matching this set. The build gate (finishBikeBuild, bulkMarkBikesBuilt,
 * the build workbench, the /work queue, the MO bikes section) reads this.
 */
export const AT_PAINTER_STATUSES: PaintOrderStatus[] = [
  "sent_to_painter",
  "at_painter",
];

export function paintOrderTransitionRequiresReason(
  to: PaintOrderStatus,
): boolean {
  return to === "cancelled";
}
