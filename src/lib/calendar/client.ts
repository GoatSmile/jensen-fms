/**
 * The calendar capability's stable interface. An adapter answers three
 * questions — can we reach this calendar (and write to it), what is in it
 * between two moments, and put this visit in it. Everything else (settings,
 * the link table, the visits page) is provider-blind.
 */
import "server-only";

import { googleCalendar } from "./google";
import { CALENDAR_PROVIDERS } from "./settings";

export type CalendarResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type CalendarEvent = {
  id: string;
  title: string;
  location: string | null;
  /** Opens the event in the provider — for people the calendar is shared with. */
  htmlLink: string | null;
  allDay: boolean;
  /** ISO date-time with offset, or a bare ISO date for an all-day event. */
  start: string;
  end: string;
};

export type NewVisit = {
  title: string;
  description: string;
  location?: string | null;
  /** Wall-clock on `timeZone`: "2026-10-02", "09:00". */
  date: string;
  time: string;
  durationMinutes: number;
  timeZone: string;
};

export type CalendarAdapter = {
  describe(calendarId: string): Promise<CalendarResult<{ name: string; timeZone: string; canWrite: boolean }>>;
  listEvents(
    calendarId: string,
    range: { from: Date; to: Date; newestFirst?: boolean },
  ): Promise<CalendarResult<CalendarEvent[]>>;
  createEvent(calendarId: string, visit: NewVisit): Promise<CalendarResult<CalendarEvent>>;
};

/** Built adapters by registry key — one without the other is a bug, not config. */
const ADAPTERS: Record<string, CalendarAdapter> = {
  google: googleCalendar,
};

export function calendarAdapter(key: string | null): CalendarAdapter | null {
  if (!key || !CALENDAR_PROVIDERS.some((p) => p.key === key)) return null;
  return ADAPTERS[key] ?? null;
}
