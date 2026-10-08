/**
 * The calendar capability's stable interface. An adapter answers three
 * questions — can we reach this calendar (and write to it), what is in it
 * between two moments, and put this entry in it. It carries the entry's KIND
 * into the provider and back, so the app can tell its own entries apart.
 * Everything else (settings, the link table, the calendar page) is
 * provider-blind.
 */
import "server-only";

import { googleCalendar } from "./google";
import type { CalendarKind } from "./kinds";
import { CALENDAR_PROVIDERS } from "./settings";

export type CalendarResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type CalendarEvent = {
  id: string;
  /** What the SYSTEM made it as; null for an event someone added in the provider. */
  kind: CalendarKind | null;
  title: string;
  location: string | null;
  /** Opens the event in the provider — for people the calendar is shared with. */
  htmlLink: string | null;
  allDay: boolean;
  /** ISO date-time with offset, or a bare ISO date for an all-day event. */
  start: string;
  end: string;
  /** Deleted in the provider — Google keeps a deleted event for a while, marked cancelled. */
  cancelled?: boolean;
};

export type NewEntry = {
  kind: CalendarKind;
  title: string;
  description: string;
  location?: string | null;
  /** Wall-clock on `timeZone`: "2026-10-02". */
  date: string;
  /** "09:00", or null for an all-day entry. */
  time: string | null;
  /** Ignored for an all-day entry. */
  durationMinutes: number;
  timeZone: string;
};

/** An adapter answers these — and, since slice 4 of plan-inbox-notes, moves and deletes. */
export type CalendarAdapter = {
  describe(calendarId: string): Promise<CalendarResult<{ name: string; timeZone: string; canWrite: boolean }>>;
  listEvents(
    calendarId: string,
    range: { from: Date; to: Date; newestFirst?: boolean },
  ): Promise<CalendarResult<CalendarEvent[]>>;
  createEvent(calendarId: string, entry: NewEntry): Promise<CalendarResult<CalendarEvent>>;
  getEvent(calendarId: string, eventId: string): Promise<CalendarResult<CalendarEvent>>;
  /** Move an entry: a new day and time (null = all day), keeping its kind and text. */
  moveEvent(calendarId: string, eventId: string, when: EntryWhen): Promise<CalendarResult<CalendarEvent>>;
  deleteEvent(calendarId: string, eventId: string): Promise<CalendarResult<null>>;
};

/** When an entry is: Danish wall-clock day and time, or a whole day. */
export type EntryWhen = { date: string; time: string | null; durationMinutes: number; timeZone: string };

/** Built adapters by registry key — one without the other is a bug, not config. */
const ADAPTERS: Record<string, CalendarAdapter> = {
  google: googleCalendar,
};

export function calendarAdapter(key: string | null): CalendarAdapter | null {
  if (!key || !CALENDAR_PROVIDERS.some((p) => p.key === key)) return null;
  return ADAPTERS[key] ?? null;
}
