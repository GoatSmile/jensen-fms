/**
 * Google Calendar through a SERVICE ACCOUNT the calendar is shared with
 * (docs/plan-service-calendar.md) — not OAuth as a person: an unpublished
 * consent screen expires its tokens every 7 days.
 *
 * No SDK. The token comes from the shared service-account signer
 * (src/lib/google/service-account.ts); this calls the REST API.
 */
import "server-only";

import { googleAccessToken } from "@/lib/google/service-account";

import type { CalendarAdapter, CalendarEvent, CalendarResult } from "./client";
import { CALENDAR_KIND_SPECS, isCalendarKind } from "./kinds";

/** Where the app's own kind rides on a Google event — private to our app's calls. */
const KIND_PROPERTY = "fms_kind";

const API = "https://www.googleapis.com/calendar/v3";
const SCOPE =
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";

function accessToken(): Promise<CalendarResult<string>> {
  return googleAccessToken(SCOPE);
}

async function call<T>(path: string, init?: RequestInit): Promise<CalendarResult<T>> {
  const token = await accessToken();
  if (!token.ok) return token;
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token.value}`, "content-type": "application/json", ...init?.headers },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) {
      // 404 on a calendar the account can't see: say so in words — it is
      // almost always the share in Part C of the setup guide.
      const why = res.status === 404 ? "calendar not found, or not shared with the service account" : json.error?.message;
      return { ok: false, error: `Google ${res.status}: ${why ?? "request failed"}` };
    }
    return { ok: true, value: json };
  } catch (e) {
    return { ok: false, error: `Google could not be reached: ${(e as Error).message}` };
  }
}

type GoogleEvent = {
  id: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};

function toEvent(e: GoogleEvent): CalendarEvent {
  const allDay = Boolean(e.start?.date && !e.start?.dateTime);
  const kind = e.extendedProperties?.private?.[KIND_PROPERTY];
  return {
    id: e.id,
    kind: isCalendarKind(kind) ? kind : null,
    title: e.summary ?? "",
    location: e.location ?? null,
    htmlLink: e.htmlLink ?? null,
    allDay,
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    cancelled: e.status === "cancelled",
  };
}

/** "2026-10-02" → "2026-10-03" — Google's all-day end is the day AFTER. */
function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Wall-clock arithmetic: "2026-10-02" + "09:00" + 60 → "2026-10-02T10:00:00". */
function addMinutes(date: string, time: string, minutes: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + minutes * 60_000);
  return t.toISOString().slice(0, 19);
}

/** Google's start/end for a day and time, or a whole day. */
function whenOf(input: { date: string; time: string | null; durationMinutes: number; timeZone: string }) {
  return input.time
    ? {
        start: { dateTime: `${input.date}T${input.time}:00`, timeZone: input.timeZone },
        end: { dateTime: addMinutes(input.date, input.time, input.durationMinutes), timeZone: input.timeZone },
      }
    : { start: { date: input.date }, end: { date: nextDay(input.date) } };
}

export const googleCalendar: CalendarAdapter = {
  async describe(calendarId) {
    const cal = await call<{ summary?: string; timeZone?: string }>(`/calendars/${encodeURIComponent(calendarId)}`);
    if (!cal.ok) return cal;
    // Reading the event list reports our access role — the calendar resource
    // itself does not. Writing needs `writer` or `owner`.
    const list = await call<{ accessRole?: string }>(
      `/calendars/${encodeURIComponent(calendarId)}/events?maxResults=1`,
    );
    if (!list.ok) return list;
    const role = list.value.accessRole ?? "";
    return {
      ok: true,
      value: {
        name: cal.value.summary ?? "",
        timeZone: cal.value.timeZone ?? "",
        canWrite: role === "writer" || role === "owner",
      },
    };
  },

  async listEvents(calendarId, { from, to, newestFirst }) {
    const q = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const r = await call<{ items?: GoogleEvent[] }>(`/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    if (!r.ok) return r;
    const events = (r.value.items ?? []).filter((e) => e.status !== "cancelled").map(toEvent);
    return { ok: true, value: newestFirst ? events.reverse() : events };
  },

  async createEvent(calendarId, input) {
    const when = whenOf(input);
    const r = await call<GoogleEvent>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify({
        summary: input.title,
        description: input.description,
        location: input.location ?? undefined,
        colorId: CALENDAR_KIND_SPECS[input.kind].googleColorId,
        extendedProperties: { private: { [KIND_PROPERTY]: input.kind } },
        ...when,
      }),
    });
    if (!r.ok) return r;
    return { ok: true, value: toEvent(r.value) };
  },

  async getEvent(calendarId, eventId) {
    const r = await call<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
    if (!r.ok) return r;
    return { ok: true, value: toEvent(r.value) };
  },

  async moveEvent(calendarId, eventId, when) {
    // PATCH touches only the times: title, kind, colour and description stay.
    const r = await call<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "PATCH", body: JSON.stringify(whenOf(when)) },
    );
    if (!r.ok) return r;
    return { ok: true, value: toEvent(r.value) };
  },

  async deleteEvent(calendarId, eventId) {
    const r = await call<Record<string, never>>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
    );
    if (!r.ok) return r;
    return { ok: true, value: null };
  },
};
