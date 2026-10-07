/**
 * What can go in the calendar. ONE list, read by the planner, the apply step,
 * the card and the calendar page, so adding a kind is an entry here plus a
 * line in the DB check (migration 118) — never a new code path.
 *
 * Pure data, safe on both sides of the server/client line.
 *
 * - `defaultTime`: what a missing time becomes. Null = an all-day entry (a
 *   reminder for "Thursday" is about the day, not 09:00).
 * - `googleColorId`: Google Calendar's own event colour, so the kinds are
 *   told apart in Google too (9 = Blueberry, 10 = Basil).
 * - `hue`: the app's colour vocabulary — a visit is the shop's own work
 *   (`brand`); a delivery is a handover of finished bikes (`good`).
 *
 * Reminders were a kind from 1 to 7 Oct and are PARKED (owner, 2026-10-07:
 * "no reminders for now, just calendar events everywhere") — every dated
 * promise is a visit or a delivery. Bringing one back is an entry here plus
 * the DB check (migration 122).
 */
export const CALENDAR_KINDS = ["visit", "delivery"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export type CalendarKindSpec = {
  defaultTime: string | null;
  defaultMinutes: number;
  googleColorId: string;
  hue: "brand" | "good";
};

export const CALENDAR_KIND_SPECS: Record<CalendarKind, CalendarKindSpec> = {
  // Owner, 2026-09-30: no time said → 09:00 for an hour.
  visit: { defaultTime: "09:00", defaultMinutes: 60, googleColorId: "9", hue: "brand" },
  delivery: { defaultTime: "09:00", defaultMinutes: 60, googleColorId: "10", hue: "good" },
};

export function isCalendarKind(v: unknown): v is CalendarKind {
  return typeof v === "string" && (CALENDAR_KINDS as readonly string[]).includes(v);
}
