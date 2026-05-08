/**
 * Manufacturing-order lifecycle helpers.
 *
 * Allowed transitions:
 *   planned     → released | cancelled
 *   released    → in_progress | cancelled
 *   in_progress → completed | on_hold | cancelled
 *   on_hold     → in_progress | cancelled
 *   completed   → (terminal)
 *   cancelled   → (terminal)
 */

export type MOStatus =
  | "planned"
  | "released"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled";

export const MO_STATUS_LABEL: Record<MOStatus, string> = {
  planned: "Planned",
  released: "Released",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const MO_STATUS_VARIANT: Record<
  MOStatus,
  "default" | "secondary" | "warning" | "success" | "destructive" | "outline"
> = {
  planned: "outline",
  released: "secondary",
  in_progress: "warning",
  on_hold: "warning",
  completed: "success",
  cancelled: "destructive",
};

export function moStatusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return MO_STATUS_LABEL[s as MOStatus] ?? s;
}

const TRANSITIONS: Record<MOStatus, MOStatus[]> = {
  planned: ["released", "cancelled"],
  released: ["in_progress", "cancelled"],
  in_progress: ["completed", "on_hold", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export function validNextMOStatuses(current: MOStatus): MOStatus[] {
  return TRANSITIONS[current] ?? [];
}

/** Cancellation always wants a reason in the audit trail. */
export function moTransitionRequiresReason(to: MOStatus): boolean {
  return to === "cancelled";
}

/** Statuses considered "open" for the home-page count. */
export const OPEN_MO_STATUSES: MOStatus[] = [
  "planned",
  "released",
  "in_progress",
  "on_hold",
];
