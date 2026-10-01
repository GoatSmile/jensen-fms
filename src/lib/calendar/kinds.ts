/**
 * What can go in the calendar (owner, 2026-10-01: "not just visits — other
 * events, reminders and such"). ONE list, read by the planner, the apply step,
 * the card and the calendar page, so adding a kind is an entry here plus a
 * line in the DB check (migration 118) — never a new code path.
 *
 * Pure data, safe on both sides of the server/client line.
 *
 * - `defaultTime`: what a missing time becomes. Null = an all-day entry (a
 *   reminder for "Thursday" is about the day, not 09:00).
 * - `googleColorId`: Google Calendar's own event colour, so the kinds are
 *   told apart in Google too (9 = Blueberry, 5 = Banana).
 * - `hue`: the app's colour vocabulary — a visit is the shop's own work
 *   (`brand`); a reminder is something not to forget (`money`, the caution hue).
 */
export const CALENDAR_KINDS = ["visit", "reminder"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export type CalendarKindSpec = {
  defaultTime: string | null;
  defaultMinutes: number;
  googleColorId: string;
  hue: "brand" | "money";
};

export const CALENDAR_KIND_SPECS: Record<CalendarKind, CalendarKindSpec> = {
  // Owner, 2026-09-30: no time said → 09:00 for an hour.
  visit: { defaultTime: "09:00", defaultMinutes: 60, googleColorId: "9", hue: "brand" },
  reminder: { defaultTime: null, defaultMinutes: 15, googleColorId: "5", hue: "money" },
};

export function isCalendarKind(v: unknown): v is CalendarKind {
  return typeof v === "string" && (CALENDAR_KINDS as readonly string[]).includes(v);
}
