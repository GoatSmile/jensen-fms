/**
 * Bike lifecycle helpers — labels, badge variants, and the transitions matrix.
 *
 * The enum is defined in Postgres; this module owns the UX concerns: how the
 * status renders in a list, and which transitions the lifecycle UI allows
 * from a given state.
 *
 * Allowed transitions follow the design review's "Bike lifecycle" table:
 *
 *   planning      → building
 *   building      → (in_stock only via the build workbench — see below)
 *   in_stock      → assigned | in_service
 *   assigned      → in_service
 *   in_service    → in_maintenance
 *   in_maintenance → in_service
 *   any state     → retired | lost_or_stolen   (both terminal)
 *
 * **building → in_stock is NOT a manual transition.** A bike reaches in_stock
 * only through `finishBikeBuild` (the build workbench Finish, and the bulk
 * "Mark N built" shortcut), which confirms the real frame number, consumes
 * inventory, and stamps build_cost. Allowing a manual dropdown move would let
 * a tech mint an in_stock bike with no confirmed frame, no parts, and no cost
 * basis — defeating the Tier 2 deliberate build. So it's omitted from the
 * matrix here; finishBikeBuild updates status directly (it bypasses this matrix
 * by design, same as autoAdvanceMOAfterBuild does for MOs).
 *
 * **planning → building requires a manufacturing order.** Without one the bike
 * has no way OUT of `building`: `finishBikeBuild` is the only path to in_stock,
 * it lives at `/manufacturing-orders/<mo>/bikes/<bike>/build`, and the build
 * queue on `/work` filters to bikes on an open MO. So an MO-less bike moved to
 * `building` is stranded — only `retired` / `lost_or_stolen` remain. That
 * happened for real (found 2026-07-28, one bike in prod) via two entirely
 * reasonable clicks: create at `/bikes/new`, then Move to → Building.
 *
 * Returns from a customer (Phase 4 maintenance) and refurbish flows aren't
 * encoded here — they require model changes that aren't in scope yet.
 */

export type BikeStatus =
  | "planning"
  | "building"
  | "in_stock"
  | "assigned"
  | "in_service"
  | "in_maintenance"
  | "retired"
  | "lost_or_stolen";

export const BIKE_STATUS_VARIANT: Record<
  BikeStatus,
  "default" | "secondary" | "warning" | "success" | "destructive" | "outline"
> = {
  planning: "outline",
  building: "warning",
  in_stock: "success",
  assigned: "default",
  in_service: "success",
  in_maintenance: "warning",
  retired: "outline",
  lost_or_stolen: "destructive",
};

const FORWARD_TRANSITIONS: Record<BikeStatus, BikeStatus[]> = {
  planning: ["building"],
  // building → in_stock is intentionally NOT here — see the module docstring.
  // The build workbench (finishBikeBuild) is the only path to in_stock.
  building: [],
  in_stock: ["assigned", "in_service"],
  assigned: ["in_service"],
  in_service: ["in_maintenance"],
  in_maintenance: ["in_service"],
  retired: [],
  lost_or_stolen: [],
};

const TERMINAL_FROM_ANY: BikeStatus[] = ["retired", "lost_or_stolen"];

/**
 * The only statuses `/bikes/new` may create. That form records a bike that
 * ALREADY EXISTS physically and which we are not building:
 *
 *   in_service — a customer's bike, in use. Needs an owner.
 *   in_stock   — unsold stock we did not build through an MO (pre-system
 *                inventory). No owner.
 *
 * It deliberately cannot create `planning`, which it used to hardcode: a
 * planning bike is one we intend to BUILD, and building happens only on a
 * manufacturing order. Creating one here produced a bike that could reach
 * `building` and then never leave it (see the docstring above).
 *
 * `in_stock` here is the one deliberate hole: it mints a bike with no
 * `build_cost_dkk`, which is exactly what `finishBikeBuild` exists to prevent
 * for bikes we DO build. It is allowed because for a bike we did not build
 * there is no build cost to record — null is the honest value, and every
 * reader of `build_cost_dkk` null-guards. Owner's call, 2026-07-28.
 */
export const RECORDABLE_STATUSES = ["in_service", "in_stock"] as const;

export type RecordableStatus = (typeof RECORDABLE_STATUSES)[number];

export function isRecordableStatus(v: string): v is RecordableStatus {
  return (RECORDABLE_STATUSES as readonly string[]).includes(v);
}

export type TransitionContext = {
  /**
   * Whether the bike is attached to a manufacturing order. Gates
   * `planning → building`, which is a one-way door without one — see the
   * module docstring. Defaults to `false`: a caller that doesn't know must not
   * accidentally offer the stranding move.
   */
  hasManufacturingOrder?: boolean;
};

/**
 * Statuses the bike can transition to from `current`. Excludes `current`
 * itself. Terminal states (retired, lost_or_stolen) are permitted from any
 * non-terminal state.
 *
 * Pass `hasManufacturingOrder` so `planning → building` is only offered when
 * the bike can actually be finished afterwards.
 */
export function validNextStatuses(
  current: BikeStatus,
  ctx: TransitionContext = {},
): BikeStatus[] {
  const isTerminal = current === "retired" || current === "lost_or_stolen";
  if (isTerminal) return [];

  let forward = FORWARD_TRANSITIONS[current] ?? [];
  if (current === "planning" && !ctx.hasManufacturingOrder) {
    forward = forward.filter((s) => s !== "building");
  }
  return [...forward, ...TERMINAL_FROM_ANY];
}

/**
 * Terminal transitions get a required reason field — these are
 * audit-trail decisions worth documenting. Forward transitions are
 * optional reason.
 */
export function transitionRequiresReason(to: BikeStatus): boolean {
  return to === "retired" || to === "lost_or_stolen";
}
