/**
 * Service-order lifecycle helpers — labels, badge variants, allowed
 * transitions. Generic across service types (painting today); the surface
 * rendering a specific type passes its supplier noun ("painter") so tech
 * copy stays concrete.
 *
 * Allowed transitions:
 *   planned       → sent | cancelled
 *   sent          → at_supplier | received_back | cancelled
 *   at_supplier   → received_back | cancelled
 *   received_back → (terminal)
 *   cancelled     → (terminal)
 *
 * `received_back` and `cancelled` are terminal. Cancellation is allowed from
 * any non-terminal state.
 */

export type ServiceOrderStatus =
  | "planned"
  | "sent"
  | "at_supplier"
  | "received_back"
  | "cancelled";

const STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  planned: "Planned",
  sent: "Sent",
  at_supplier: "At supplier",
  received_back: "Received back",
  cancelled: "Cancelled",
};

export const SERVICE_ORDER_STATUS_VARIANT: Record<
  ServiceOrderStatus,
  "default" | "secondary" | "warning" | "success" | "destructive" | "outline"
> = {
  planned: "outline",
  sent: "secondary",
  at_supplier: "warning",
  received_back: "success",
  cancelled: "destructive",
};

/**
 * Status label, optionally flavoured with the type's supplier noun so the
 * paint surface reads "Sent to painter" / "At painter" instead of the
 * generic "Sent" / "At supplier".
 */
export function serviceOrderStatusLabel(
  s: string | null | undefined,
  supplierNoun?: string,
): string {
  if (!s) return "—";
  if (supplierNoun) {
    if (s === "sent") return `Sent to ${supplierNoun}`;
    if (s === "at_supplier") return `At ${supplierNoun}`;
  }
  return STATUS_LABEL[s as ServiceOrderStatus] ?? s;
}

const TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  planned: ["sent", "cancelled"],
  sent: ["at_supplier", "received_back", "cancelled"],
  at_supplier: ["received_back", "cancelled"],
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
  "sent",
  "at_supplier",
];

/**
 * Statuses where the batch is physically AWAY at the supplier, so its bikes
 * can't be built (Tier 2 Phase C / D2, generalized). Narrower than
 * OPEN_SERVICE_ORDER_STATUSES: a `planned` order hasn't shipped yet, so its
 * bikes are still buildable. `received_back` frees the frames automatically —
 * a bike simply stops matching this set. The build gate (finishBikeBuild,
 * bulkMarkBikesBuilt, the build workbench, the /work queue, the MO bikes
 * section) reads this via loadAtSupplierBikeIds.
 */
export const AT_SUPPLIER_STATUSES: ServiceOrderStatus[] = [
  "sent",
  "at_supplier",
];

export function serviceOrderTransitionRequiresReason(
  to: ServiceOrderStatus,
): boolean {
  return to === "cancelled";
}
