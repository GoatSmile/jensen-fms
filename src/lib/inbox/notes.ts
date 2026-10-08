import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CallsScope } from "@/lib/calls/access";
import { danishDayKey, danishMidnight, danishTime, dayHeading, shiftDayKey } from "@/lib/calls/days";
import { countOpenSuggestions, parseCommandPlan } from "@/lib/inbound/command/plan";

/**
 * The Inbox's notes board (plan-inbox-notes.md, slice 2): one column per
 * person holding their OPEN notes — a to-do until someone presses Done.
 *
 * A note's column is the person it is FOR: its addressee, else its speaker.
 * "Finn → Dennis" is Dennis's to-do, so on the office board it sits in
 * Dennis's column only; Finn's own view still lists it, as something he said.
 * Old open notes are never dropped — they fold into a counted line (the
 * page's promise, as for calls: open work is never out of sight).
 */

/** Notes from today and yesterday show in full; older open ones fold. */
export const NOTE_FULL_DAYS = 2;
/** Past this age an open note wears its age in the caution hue. */
export const NOTE_STALE_DAYS = 7;
/** How far back Done notes are listed for Reopen. */
const DONE_DAYS = 14;

export type NoteItem = {
  id: string;
  receivedAt: string;
  body: string | null;
  /** received = still being transcribed; failed = could not be. */
  status: "received" | "understood" | "failed" | string;
  hasAudio: boolean;
  speakerId: string | null;
  speakerName: string | null;
  addresseeId: string | null;
  addresseeName: string | null;
  /** The page it was said on (note_context.path). */
  contextPath: string | null;
  openSuggestions: number;
  closedAt: string | null;
  closedByName: string | null;
  /** Whole days since it was said. */
  ageDays: number;
  /** A reminder's day, formatted ("Monday 12 Oct"), when the note named one. */
  dueDate: string | null;
  /** Danish day key, time and day heading — formatted here, not in the browser. */
  dayKey: string;
  time: string;
  dayLabel: string;
};

export type NoteColumn = {
  personId: string;
  name: string;
  own: boolean;
  /** Today and yesterday, newest first. */
  recent: NoteItem[];
  /** Older open notes, newest first — folded on the page. */
  older: NoteItem[];
};

export type NotesBoard = {
  columns: NoteColumn[];
  /** People with nothing open — chips, not columns (owner, 2026-10-08). */
  empty: { personId: string; name: string }[];
  done: NoteItem[];
  todayKey: string;
  yesterdayKey: string;
};

type Row = {
  id: string;
  received_at: string;
  body_text: string | null;
  status: string;
  media_path: string | null;
  handled_by_person_id: string | null;
  addressed_to_person_id: string | null;
  note_context: unknown;
  command_plan: unknown;
  disposition: string | null;
  closed_at: string | null;
  closed_by: string | null;
  due_date: string | null;
};

const COLUMNS =
  "id, received_at, body_text, status, media_path, handled_by_person_id, addressed_to_person_id, note_context, command_plan, disposition, closed_at, closed_by, due_date";

export async function loadNotesBoard(
  supabase: SupabaseClient,
  opts: { scope: CallsScope; viewerId: string | null; locale: string },
): Promise<NotesBoard> {
  const own = (q: ReturnType<typeof base>) =>
    opts.scope.all
      ? q
      : q.or(`handled_by_person_id.eq.${opts.scope.personId},addressed_to_person_id.eq.${opts.scope.personId}`);
  const base = () => supabase.from("inbound_messages").select(COLUMNS).eq("kind", "note");

  const doneSince = danishMidnight(shiftDayKey(danishDayKey(new Date()), -DONE_DAYS)).toISOString();
  const [openRes, doneRes, peopleRes] = await Promise.all([
    own(base())
      .not("disposition", "in", "(handled,spam)")
      .order("received_at", { ascending: false })
      .limit(500),
    own(base())
      .eq("disposition", "handled")
      .gte("closed_at", doneSince)
      .order("closed_at", { ascending: false })
      .limit(100),
    supabase.from("people").select("id, full_name, is_active, is_system"),
  ]);
  if (openRes.error) throw new Error(`Failed to load notes: ${openRes.error.message}`);

  const people = (peopleRes.data ?? []) as { id: string; full_name: string; is_active: boolean; is_system: boolean }[];
  const name = new Map(people.map((p) => [p.id, p.full_name]));
  const openRows = (openRes.data ?? []) as Row[];
  const doneRows = (doneRes.data ?? []) as Row[];

  // Applied suggestions, for the open count a card shows.
  const planned = openRows.filter((r) => r.command_plan);
  const applied = new Map<string, Set<string>>();
  if (planned.length) {
    const { data } = await supabase
      .from("command_actions")
      .select("message_id, plan_action_id")
      .in("message_id", planned.map((r) => r.id));
    for (const a of data ?? []) {
      const set = applied.get(a.message_id) ?? new Set<string>();
      set.add(a.plan_action_id);
      applied.set(a.message_id, set);
    }
  }

  const todayKey = danishDayKey(new Date());
  const fullFrom = danishMidnight(shiftDayKey(todayKey, -(NOTE_FULL_DAYS - 1))).getTime();
  const toItem = (r: Row): NoteItem => {
    const ctx = (r.note_context ?? {}) as { path?: unknown };
    return {
      id: r.id,
      receivedAt: r.received_at,
      body: r.body_text,
      status: r.status,
      hasAudio: Boolean(r.media_path),
      speakerId: r.handled_by_person_id,
      speakerName: r.handled_by_person_id ? (name.get(r.handled_by_person_id) ?? null) : null,
      addresseeId: r.addressed_to_person_id,
      addresseeName: r.addressed_to_person_id ? (name.get(r.addressed_to_person_id) ?? null) : null,
      contextPath: typeof ctx.path === "string" ? ctx.path : null,
      openSuggestions: r.command_plan
        ? countOpenSuggestions(parseCommandPlan(r.command_plan), applied.get(r.id) ?? new Set())
        : 0,
      closedAt: r.closed_at,
      closedByName: r.closed_by ? (name.get(r.closed_by) ?? null) : null,
      ageDays: Math.floor((Date.now() - new Date(r.received_at).getTime()) / 86_400_000),
      dueDate: r.due_date ? dayHeading(r.due_date, opts.locale) : null,
      dayKey: danishDayKey(r.received_at),
      time: danishTime(r.received_at),
      dayLabel: dayHeading(danishDayKey(r.received_at), opts.locale),
    };
  };

  // Column = who it is FOR. In one's own view everything lands in one column.
  const byPerson = new Map<string, NoteItem[]>();
  for (const r of openRows) {
    const key = opts.scope.all
      ? (r.addressed_to_person_id ?? r.handled_by_person_id ?? "")
      : opts.scope.personId;
    if (!key) continue;
    const list = byPerson.get(key) ?? [];
    list.push(toItem(r));
    byPerson.set(key, list);
  }

  const viewer = opts.viewerId;
  const columns: NoteColumn[] = [...byPerson.entries()]
    .map(([personId, items]) => ({
      personId,
      name: name.get(personId) ?? "—",
      own: personId === viewer,
      recent: items.filter((i) => new Date(i.receivedAt).getTime() >= fullFrom),
      older: items.filter((i) => new Date(i.receivedAt).getTime() < fullFrom),
    }))
    // Yours first, then whoever has the most open (owner, 2026-10-08).
    .sort((a, b) =>
      a.own !== b.own
        ? a.own
          ? -1
          : 1
        : b.recent.length + b.older.length - (a.recent.length + a.older.length) ||
          a.name.localeCompare(b.name, "da"),
    );

  // Empty chips: on the office board, everyone who keeps notes or owns a line
  // and has nothing open; in one's own view, nothing (the empty state says it).
  let empty: NotesBoard["empty"] = [];
  if (opts.scope.all) {
    const { data: lines } = await supabase.from("phone_lines").select("person_id").not("person_id", "is", null);
    const candidates = new Set<string>([
      ...((lines ?? []) as { person_id: string }[]).map((l) => l.person_id),
      ...doneRows.map((r) => r.handled_by_person_id).filter((v): v is string => !!v),
      ...(viewer ? [viewer] : []),
    ]);
    const activeIds = new Set(people.filter((p) => p.is_active && !p.is_system).map((p) => p.id));
    empty = [...candidates]
      .filter((id) => activeIds.has(id) && !byPerson.has(id))
      .map((id) => ({ personId: id, name: name.get(id) ?? "—" }))
      .sort((a, b) => a.name.localeCompare(b.name, "da"));
  }

  return {
    columns,
    empty,
    done: doneRows.map(toItem),
    todayKey,
    yesterdayKey: shiftDayKey(todayKey, -1),
  };
}
