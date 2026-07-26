/**
 * Work-order lifecycle helpers — labels, badge variants, and the transition
 * matrix. Mirrors `src/lib/maintenance/ticket-status.ts` shape.
 *
 * Allowed transitions:
 *   open        → in_progress | cancelled
 *   in_progress → completed | cancelled
 *   completed   → (terminal)
 *   cancelled   → (terminal)
 */

export type WorkOrderStatus =
  | "open"
  | "in_progress"
  | "completed"
  | "cancelled";

export const WO_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
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

export const WO_STATUS_VARIANT: Record<WorkOrderStatus, BadgeVariant> = {
  open: "outline",
  in_progress: "warning",
  completed: "success",
  cancelled: "destructive",
};

const TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function validNextWOStatuses(
  current: WorkOrderStatus,
): WorkOrderStatus[] {
  return TRANSITIONS[current] ?? [];
}

/** Cancelling a work order always wants a reason in the audit trail. */
export function woTransitionRequiresReason(to: WorkOrderStatus): boolean {
  return to === "cancelled";
}

/** Statuses considered "open" for the home-page count and list defaults. */
export const OPEN_WO_STATUSES: WorkOrderStatus[] = ["open", "in_progress"];

/** Closed statuses where edits are refused. */
export const CLOSED_WO_STATUSES: WorkOrderStatus[] = ["completed", "cancelled"];

export function isWOEditable(status: WorkOrderStatus): boolean {
  return !CLOSED_WO_STATUSES.includes(status);
}
