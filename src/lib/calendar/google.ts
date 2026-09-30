/**
 * Google Calendar through a SERVICE ACCOUNT the calendar is shared with
 * (docs/plan-service-calendar.md) — not OAuth as a person: an unpublished
 * consent screen expires its tokens every 7 days.
 *
 * No SDK. The service account signs a JWT with its key (Node's crypto), trades
 * it for an hour's access token, and calls the REST API. The key is read from
 * env on each token request and never leaves the server.
 */
import "server-only";

import crypto from "node:crypto";

import type { CalendarAdapter, CalendarEvent, CalendarResult } from "./client";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPE =
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";

type ServiceAccountKey = { client_email: string; private_key: string };

let cached: { token: string; expiresAt: number } | null = null;

function readKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const k = JSON.parse(raw) as Partial<ServiceAccountKey>;
    return k.client_email && k.private_key
      ? { client_email: k.client_email, private_key: k.private_key }
      : null;
  } catch {
    return null;
  }
}

async function accessToken(): Promise<CalendarResult<string>> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return { ok: true, value: cached.token };
  const key = readKey();
  if (!key) return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_KEY is missing or not a service-account key" };

  const b64 = (v: string) => Buffer.from(v).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.` +
    b64(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  let signature: string;
  try {
    signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), key.private_key).toString("base64url");
  } catch (e) {
    return { ok: false, error: `the key could not sign: ${(e as Error).message}` };
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
      cache: "no-store",
    });
    const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (!res.ok || !json.access_token) {
      return { ok: false, error: `Google refused the key: ${json.error_description ?? json.error ?? res.status}` };
    }
    cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return { ok: true, value: json.access_token };
  } catch (e) {
    return { ok: false, error: `Google could not be reached: ${(e as Error).message}` };
  }
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
};

function toEvent(e: GoogleEvent): CalendarEvent {
  const allDay = Boolean(e.start?.date && !e.start?.dateTime);
  return {
    id: e.id,
    title: e.summary ?? "",
    location: e.location ?? null,
    htmlLink: e.htmlLink ?? null,
    allDay,
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
  };
}

/** Wall-clock arithmetic: "2026-10-02" + "09:00" + 60 → "2026-10-02T10:00:00". */
function addMinutes(date: string, time: string, minutes: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + minutes * 60_000);
  return t.toISOString().slice(0, 19);
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
    const r = await call<GoogleEvent>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      body: JSON.stringify({
        summary: input.title,
        description: input.description,
        location: input.location ?? undefined,
        start: { dateTime: `${input.date}T${input.time}:00`, timeZone: input.timeZone },
        end: { dateTime: addMinutes(input.date, input.time, input.durationMinutes), timeZone: input.timeZone },
      }),
    });
    if (!r.ok) return r;
    return { ok: true, value: toEvent(r.value) };
  },
};
