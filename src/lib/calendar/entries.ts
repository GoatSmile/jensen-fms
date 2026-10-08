/**
 * The ONE way the system puts something in the calendar. A call's suggestion,
 * a spoken command and — later — a button on a paint order or a delivery all
 * come here, so the defaults, the minimal-personal-data rule and the link row
 * cannot drift between them. Callers check who may do it; this does not.
 *
 * Google holds the entry; `calendar_events` only says where an entry the
 * SYSTEM made came from (migration 117) and what kind it is (118).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { calendarAdapter, type CalendarEvent } from "./client";
import { CALENDAR_KIND_SPECS, type CalendarKind } from "./kinds";
import { CALENDAR_TIME_ZONE, calendarReady, loadCalendarSettings } from "./settings";

export type NewCalendarEntry = {
  kind: CalendarKind;
  /** Customer + errand. NEVER a phone number or a contact's name. */
  title: string;
  /** A line that leads back into the app — the only free text that travels. */
  description: string;
  location?: string | null;
  /** "2026-10-02" on Danish time. */
  date: string;
  /** "10:00"; null takes the kind's default — which may be all-day. */
  time: string | null;
  /** Null takes the kind's default. */
  durationMinutes: number | null;
  /** Where it came from — each optional, all kept for the link back. */
  messageId?: string | null;
  ticketId?: string | null;
  organizationId?: string | null;
  /** A delivery's order — the offer while it is only quoted, else the SO. */
  salesOrderId?: string | null;
  offerId?: string | null;
  createdBy?: string | null;
};

export type CalendarEntryResult =
  | { ok: true; linkId: string; event: CalendarEvent }
  | { ok: false; code: "not_configured" | "bad_date" | "bad_time" | "bad_duration" | "provider" | "link"; detail?: string };

export async function createCalendarEntry(
  supabase: SupabaseClient,
  entry: NewCalendarEntry,
): Promise<CalendarEntryResult> {
  const settings = await loadCalendarSettings(supabase);
  const adapter = calendarAdapter(settings.provider);
  if (!calendarReady(settings) || !adapter) return { ok: false, code: "not_configured" };

  const spec = CALENDAR_KIND_SPECS[entry.kind];
  const date = entry.date.trim();
  const time = (entry.time ?? spec.defaultTime)?.trim() || null;
  const minutes = entry.durationMinutes ?? spec.defaultMinutes;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, code: "bad_date" };
  if (time && !/^\d{2}:\d{2}$/.test(time)) return { ok: false, code: "bad_time" };
  if (time && (!Number.isFinite(minutes) || minutes < 15 || minutes > 600)) {
    return { ok: false, code: "bad_duration" };
  }

  const created = await adapter.createEvent(settings.calendarId, {
    kind: entry.kind,
    title: entry.title,
    description: entry.description,
    location: entry.location ?? null,
    date,
    time,
    durationMinutes: Math.round(minutes),
    timeZone: CALENDAR_TIME_ZONE,
  });
  if (!created.ok) return { ok: false, code: "provider", detail: created.error };

  const { data: link, error } = await supabase
    .from("calendar_events")
    .insert({
      provider: settings.provider,
      calendar_id: settings.calendarId,
      external_event_id: created.value.id,
      kind: entry.kind,
      message_id: entry.messageId ?? null,
      ticket_id: entry.ticketId ?? null,
      organization_id: entry.organizationId ?? null,
      sales_order_id: entry.salesOrderId ?? null,
      offer_id: entry.offerId ?? null,
      title: entry.title,
      // An all-day entry's bounds are bare dates; keep only real moments.
      starts_at: created.value.allDay ? null : created.value.start || null,
      ends_at: created.value.allDay ? null : created.value.end || null,
      created_by: entry.createdBy ?? null,
    })
    .select("id")
    .single();
  // The entry exists in the provider either way; only the link back failed.
  if (error || !link) return { ok: false, code: "link", detail: error?.message };
  return { ok: true, linkId: link.id, event: created.value };
}

export type CalendarChangeResult =
  | { ok: true; event: CalendarEvent | null; before: CalendarEvent }
  | { ok: false; code: "not_configured" | "bad_date" | "bad_time" | "not_found" | "provider"; detail?: string };

/**
 * MOVE an entry to a new day and time (plan-inbox-notes.md, slice 4) — the
 * second door, beside `createCalendarEntry`. Its length is kept unless a new
 * one was said; an all-day entry given a time takes its kind's default
 * length. The link row (if the system made it) follows.
 */
export async function moveCalendarEntry(
  supabase: SupabaseClient,
  change: { eventId: string; date: string; time: string | null; durationMinutes: number | null },
): Promise<CalendarChangeResult> {
  const settings = await loadCalendarSettings(supabase);
  const adapter = calendarAdapter(settings.provider);
  if (!calendarReady(settings) || !adapter) return { ok: false, code: "not_configured" };
  const date = change.date.trim();
  const time = change.time?.trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, code: "bad_date" };
  if (time && !/^\d{2}:\d{2}$/.test(time)) return { ok: false, code: "bad_time" };

  const before = await adapter.getEvent(settings.calendarId, change.eventId);
  if (!before.ok) return { ok: false, code: "not_found", detail: before.error };
  const kindSpec = CALENDAR_KIND_SPECS[before.value.kind ?? "visit"];
  const keptMinutes =
    !before.value.allDay && before.value.start && before.value.end
      ? Math.round((Date.parse(before.value.end) - Date.parse(before.value.start)) / 60_000)
      : kindSpec.defaultMinutes;
  const minutes = change.durationMinutes ?? keptMinutes;

  const moved = await adapter.moveEvent(settings.calendarId, change.eventId, {
    date,
    time,
    durationMinutes: minutes,
    timeZone: CALENDAR_TIME_ZONE,
  });
  if (!moved.ok) return { ok: false, code: "provider", detail: moved.error };
  await supabase
    .from("calendar_events")
    .update({
      starts_at: moved.value.allDay ? null : moved.value.start || null,
      ends_at: moved.value.allDay ? null : moved.value.end || null,
    })
    .eq("external_event_id", change.eventId);
  return { ok: true, event: moved.value, before: before.value };
}

/**
 * DELETE an entry. Returns what it was, so the result can say which entry
 * went. The link row goes too — it would only point at nothing.
 */
export async function deleteCalendarEntry(
  supabase: SupabaseClient,
  eventId: string,
): Promise<CalendarChangeResult> {
  const settings = await loadCalendarSettings(supabase);
  const adapter = calendarAdapter(settings.provider);
  if (!calendarReady(settings) || !adapter) return { ok: false, code: "not_configured" };
  const before = await adapter.getEvent(settings.calendarId, eventId);
  if (!before.ok) return { ok: false, code: "not_found", detail: before.error };
  const gone = await adapter.deleteEvent(settings.calendarId, eventId);
  if (!gone.ok) return { ok: false, code: "provider", detail: gone.error };
  await supabase.from("calendar_events").delete().eq("external_event_id", eventId);
  return { ok: true, event: null, before: before.value };
}

/**
 * Entries in a window whose title has any of the words — the planner's way to
 * find "Thursday's visit to Gladsaxe". Read live from the provider.
 */
export async function findCalendarEntries(
  supabase: SupabaseClient,
  q: { words: string[]; from: Date; to: Date },
): Promise<{ ok: true; events: CalendarEvent[] } | { ok: false; detail: string }> {
  const settings = await loadCalendarSettings(supabase);
  const adapter = calendarAdapter(settings.provider);
  if (!calendarReady(settings) || !adapter) return { ok: false, detail: "calendar not configured" };
  const r = await adapter.listEvents(settings.calendarId, { from: q.from, to: q.to });
  if (!r.ok) return { ok: false, detail: r.error };
  const words = q.words.map((w) => w.toLocaleLowerCase("da-DK")).filter((w) => w.length >= 3);
  const events = words.length
    ? r.value.filter((e) => words.some((w) => e.title.toLocaleLowerCase("da-DK").includes(w)))
    : r.value;
  return { ok: true, events };
}
