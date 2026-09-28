/**
 * Service-order lifecycle helpers — labels, badge variants, allowed
 * transitions. Generic across service types (painting today); the surface
 * rendering a specific type passes its supplier noun ("painter") so tech
 * copy stays concrete.
 *
 * Allowed transitions (migration 106 — the paperwork is not the goods):
 *   planned       → confirmed | cancelled      (emailing = confirming; prices freeze)
 *   confirmed     → at_supplier | cancelled    (on the drop-off date, or by hand)
 *   at_supplier   → ready | received_back | cancelled
 *   ready         → received_back | cancelled
 *   received_back → (terminal)
 *   cancelled     → (terminal)
 *
 * `received_back` and `cancelled` are terminal. Cancellation is allowed from
 * any non-terminal state.
 */

export type ServiceOrderStatus =
  | "planned"
  | "confirmed"
  | "at_supplier"
  | "ready"
  | "received_back"
  | "cancelled";

export const SERVICE_ORDER_STATUS_VARIANT: Record<
  ServiceOrderStatus,
  "default" | "secondary" | "warning" | "success" | "destructive" | "outline"
> = {
  planned: "outline",
  confirmed: "secondary",
  at_supplier: "warning",
  ready: "warning",
  received_back: "success",
  cancelled: "destructive",
};

const TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  planned: ["confirmed", "cancelled"],
  confirmed: ["at_supplier", "cancelled"],
  at_supplier: ["ready", "received_back", "cancelled"],
  ready: ["received_back", "cancelled"],
  received_back: [],
  cancelled: [],
};

export function validNextServiceOrderStatuses(
  current: ServiceOrderStatus,
): ServiceOrderStatus[] {
  return TRANSITIONS[current] ?? [];
}

/** Statuses that count as "open" (still in flight). */
export const OPEN_SERVICE_ORDER_STATUSES: ServiceOrderStatus[] = [
  "planned",
  "confirmed",
  "at_supplier",
  "ready",
];

/**
 * Statuses where the batch is physically AWAY at the supplier, so its bikes
 * can't be built (Tier 2 Phase C / D2, generalized). Narrower than
 * OPEN_SERVICE_ORDER_STATUSES: a `planned` or `confirmed` order hasn't left
 * the building — confirming is paperwork (migration 106) — so its bikes are
 * still here. A bike whose frame still needs paint is held back by readiness
 * (*needs paint*) instead, not by this set. `received_back` frees the frames automatically —
 * a bike simply stops matching this set. The build gate (finishBikeBuild,
 * bulkMarkBikesBuilt, the build workbench, the /work queue, the MO bikes
 * section) reads this via loadAtSupplierBikeIds.
 */
export const AT_SUPPLIER_STATUSES: ServiceOrderStatus[] = [
  "at_supplier",
  "ready",
];

/** Prices are frozen on the lines from `confirmed` on (the send). */
export const PRICES_FROZEN_STATUSES: ServiceOrderStatus[] = [
  "confirmed",
  "at_supplier",
  "ready",
  "received_back",
];

export function serviceOrderTransitionRequiresReason(
  to: ServiceOrderStatus,
): boolean {
  return to === "cancelled";
}
