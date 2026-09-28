/**
 * Sales-order lifecycle helpers. Mirrors lib/mo/status.ts.
 *
 * Allowed transitions:
 *   draft          → confirmed | cancelled
 *   confirmed      → in_production | cancelled
 *   in_production  → ready | cancelled
 *   ready          → delivered | cancelled
 *   delivered      → (terminal — generates invoice, but the SO itself is closed)
 *
 * An order with NO bike lines — an extra battery, a charger — has nothing to
 * produce, so `confirmed → ready` directly (owner, 2026-09-28): walking it
 * through "in production" was a click that meant nothing.
 *   cancelled      → (terminal)
 *
 * Side-effects on transition:
 *   - confirmed: slate every linked-MO bike to the SO's customer
 *   - delivered: flip those bikes to status='assigned'
 *   - cancelled: unslate (clear owner from any unbuilt bikes); built ones
 *     stay slated and the workshop deals with them by hand
 *
 * (Side-effects live in src/app/sales-orders/_actions/transition-so.ts;
 *  this file is just the shape + matrix.)
 */

export type SOStatus =
  | "draft"
  | "confirmed"
  | "in_production"
  | "ready"
  | "delivered"
  | "cancelled";

export const SO_STATUS_VARIANT: Record<
  SOStatus,
  "default" | "secondary" | "warning" | "success" | "destructive" | "outline"
> = {
  draft: "outline",
  confirmed: "secondary",
  in_production: "warning",
  ready: "warning",
  delivered: "success",
  cancelled: "destructive",
};

const TRANSITIONS: Record<SOStatus, SOStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["in_production", "cancelled"],
  in_production: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export type SOTransitionContext = {
  /** Does the order have any bike-template line? Omitted = assume yes. */
  hasBikeLines?: boolean;
};

export function validNextSOStatuses(
  current: SOStatus,
  ctx: SOTransitionContext = {},
): SOStatus[] {
  if (current === "confirmed" && ctx.hasBikeLines === false) {
    return ["ready", "cancelled"];
  }
  return TRANSITIONS[current] ?? [];
}

/** Cancellation wants an audit-trail reason; everything else is a click. */
export function soTransitionRequiresReason(to: SOStatus): boolean {
  return to === "cancelled";
}

/** Statuses where the SO is locked from header edits (lines stay editable
 *  until confirmed). */
export function isSOClosed(s: SOStatus): boolean {
  return s === "delivered" || s === "cancelled";
}

/** True while lines can still be added/removed/edited. */
export function canEditSOLines(s: SOStatus): boolean {
  return s === "draft";
}
