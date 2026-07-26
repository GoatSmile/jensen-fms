/**
 * Maintenance-ticket lifecycle helpers — labels, badge variants, and the
 * transition matrix. Mirrors `src/lib/mo/status.ts` shape.
 *
 * Allowed transitions:
 *   open           → in_diagnosis | cancelled
 *   in_diagnosis   → awaiting_parts | in_repair | resolved | cancelled
 *   awaiting_parts → in_repair | cancelled
 *   in_repair      → resolved | cancelled
 *   resolved       → closed
 *   closed         → (terminal)
 *   cancelled      → (terminal)
 */

export type TicketStatus =
  | "open"
  | "in_diagnosis"
  | "awaiting_parts"
  | "in_repair"
  | "resolved"
  | "closed"
  | "cancelled";

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_diagnosis: "In diagnosis",
  awaiting_parts: "Awaiting parts",
  in_repair: "In repair",
  resolved: "Resolved",
  closed: "Closed",
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

export const TICKET_STATUS_VARIANT: Record<TicketStatus, BadgeVariant> = {
  open: "outline",
  in_diagnosis: "warning",
  awaiting_parts: "warning",
  in_repair: "warning",
  resolved: "success",
  closed: "secondary",
  cancelled: "destructive",
};

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_diagnosis", "cancelled"],
  in_diagnosis: ["awaiting_parts", "in_repair", "resolved", "cancelled"],
  awaiting_parts: ["in_repair", "cancelled"],
  in_repair: ["resolved", "cancelled"],
  resolved: ["closed"],
  closed: [],
  cancelled: [],
};

export function validNextTicketStatuses(current: TicketStatus): TicketStatus[] {
  return TRANSITIONS[current] ?? [];
}

/** Cancelling a ticket always wants a reason in the audit trail. */
export function ticketTransitionRequiresReason(to: TicketStatus): boolean {
  return to === "cancelled";
}

/** Statuses considered "open" for the home-page count and list defaults. */
export const OPEN_TICKET_STATUSES: TicketStatus[] = [
  "open",
  "in_diagnosis",
  "awaiting_parts",
  "in_repair",
];

/* ---------- ticket_source ------------------------------------------------ */

export type TicketSource =
  | "email"
  | "phone"
  | "app"
  | "in_person"
  | "scheduled"
  | "other";

export const TICKET_SOURCES: TicketSource[] = [
  "email",
  "phone",
  "app",
  "in_person",
  "scheduled",
  "other",
];

/* ---------- priority ----------------------------------------------------- */

/**
 * Priority scale: 1 = Urgent (something is on fire), 5 = Minor (cosmetic).
 * Default is 3 (Normal). Schema column is `smallint NOT NULL DEFAULT 3`.
 */
export type TicketPriority = 1 | 2 | 3 | 4 | 5;

export const TICKET_PRIORITY_VARIANT: Record<TicketPriority, BadgeVariant> = {
  1: "destructive",
  2: "warning",
  3: "outline",
  4: "secondary",
  5: "ghost",
};

export const TICKET_PRIORITIES: TicketPriority[] = [1, 2, 3, 4, 5];

export function ticketPriorityVariant(
  p: number | null | undefined,
): BadgeVariant {
  if (p == null) return "outline";
  return TICKET_PRIORITY_VARIANT[p as TicketPriority] ?? "outline";
}
