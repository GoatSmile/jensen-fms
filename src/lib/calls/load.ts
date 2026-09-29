import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseExtraction } from "@/lib/inbound/extraction";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

import type { CallsScope } from "./access";
import { danishDayKey, danishMidnight, groupByDanishDay, shiftDayKey, type DayGroup } from "./days";
import { loadPhoneLines, numberTail } from "./lines";
import { isOpenLane, triageCall, type CallLane, type CallTriage } from "./triage";

/** How many Danish days one page of the Calls list covers. */
export const WINDOW_DAYS = 14;

export type CallListRow = {
  id: string;
  channel: string;
  received_at: string;
  from_identity: string | null;
  duration_seconds: number | null;
  status: string;
  error: string | null;
  ticket_id: string | null;
  disposition: string | null;
  direction: "incoming" | "outgoing" | null;
  /** Whose line: a person's name, or the shared line's label. */
  lineName: string | null;
  orgName: string | null;
  callerName: string | null;
  /** One line: what the call was about. */
  summary: string | null;
  /** What the workshop promised — shown on the row, never folded away. */
  promises: string[];
  triage: CallTriage;
  lane: CallLane;
};

export type CallTab = { key: string; label: string; open: number };

export type CallsPage = {
  tabs: CallTab[];
  activeTab: string;
  days: DayGroup<CallListRow>[];
  counts: Record<CallLane, number>;
  /** The Danish day this page ends before (exclusive), and the one before it. */
  untilKey: string;
  earlierKey: string;
  hasLines: boolean;
};

type RawRow = {
  id: string;
  channel: string;
  status: string;
  error: string | null;
  disposition: string | null;
  ticket_id: string | null;
  body_text: string | null;
  duration_seconds: number | null;
  transcript_confidence: number | null;
  spam_signals: unknown;
  matched_organization_id: string | null;
  match_candidates: unknown;
  extraction: unknown;
  from_identity: string | null;
  received_at: string;
  channel_meta: unknown;
  phone_line_id: string | null;
  handled_by_person_id: string | null;
};

const ROW_COLUMNS =
  "id, channel, status, error, disposition, ticket_id, body_text, duration_seconds, transcript_confidence, spam_signals, matched_organization_id, match_candidates, extraction, from_identity, received_at, channel_meta, phone_line_id, handled_by_person_id";

/**
 * Everything the Calls page shows, for one viewer, one tab and one window of
 * Danish days. The rows come in once (paged past PostgREST's silent 1000 cap)
 * and are triaged in memory; tabs, counts and day groups are all views of
 * that one pass, so they cannot disagree.
 */
export async function loadCallsPage(
  supabase: SupabaseClient,
  opts: { scope: CallsScope; viewerId: string | null; tab: string | null; until: string | null },
): Promise<CallsPage> {
  const todayKey = danishDayKey(new Date());
  const untilKey =
    opts.until && /^\d{4}-\d{2}-\d{2}$/.test(opts.until) && opts.until <= shiftDayKey(todayKey, 1)
      ? opts.until
      : shiftDayKey(todayKey, 1);
  const fromKey = shiftDayKey(untilKey, -WINDOW_DAYS);

  const [lines, peopleRes, rowsRes, olderRes] = await Promise.all([
    loadPhoneLines(supabase),
    supabase.from("people").select("id, full_name, phone").eq("is_active", true),
    fetchAllRows<RawRow>((from, to) => {
      let q = supabase
        .from("inbound_messages")
        .select(ROW_COLUMNS)
        .neq("kind", "command")
        .gte("received_at", danishMidnight(fromKey).toISOString())
        .lt("received_at", danishMidnight(untilKey).toISOString())
        .order("received_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (!opts.scope.all) q = q.eq("handled_by_person_id", opts.scope.personId);
      return q as unknown as PromiseLike<{ data: RawRow[] | null; error: { message: string } | null }>;
    }),
    // The page's promise: work left undone is never out of sight. Calls BEFORE
    // this window that nobody has closed come along, and only the ones the
    // rules still call open are kept (below). Bounded: this is a backlog, and
    // a backlog of 300 open calls is a different conversation.
    (() => {
      let q = supabase
        .from("inbound_messages")
        .select(ROW_COLUMNS)
        .neq("kind", "command")
        .lt("received_at", danishMidnight(fromKey).toISOString())
        .is("ticket_id", null)
        .not("disposition", "in", "(handled,spam)")
        .order("received_at", { ascending: false })
        .limit(300);
      if (!opts.scope.all) q = q.eq("handled_by_person_id", opts.scope.personId);
      return q;
    })(),
  ]);
  if (rowsRes.error) throw new Error(`Failed to load calls: ${rowsRes.error}`);
  const rawRows: RawRow[] = [...rowsRes.data, ...((olderRes.data ?? []) as RawRow[])];
  const olderIds = new Set(((olderRes.data ?? []) as RawRow[]).map((r) => r.id));

  const people = (peopleRes.data ?? []) as { id: string; full_name: string; phone: string | null }[];
  const personName = new Map(people.map((p) => [p.id, p.full_name]));
  const lineById = new Map(lines.map((l) => [l.id, l]));

  // A call to or from one of our own lines or people is internal.
  const ownTails = new Set(
    [...lines.map((l) => l.line_number), ...people.map((p) => p.phone)]
      .map(numberTail)
      .filter((v): v is string => !!v),
  );

  const orgIds = [...new Set(rawRows.map((r) => r.matched_organization_id).filter(Boolean))] as string[];
  const orgName = new Map<string, string>();
  for (let i = 0; i < orgIds.length; i += 200) {
    const { data } = await supabase
      .from("organizations")
      .select("id, legal_name, display_name_da, display_name_en")
      .in("id", orgIds.slice(i, i + 200));
    for (const o of data ?? []) {
      orgName.set(o.id, o.display_name_da ?? o.display_name_en ?? o.legal_name);
    }
  }

  const mapped: (CallListRow & { tabKeys: string[] })[] = rawRows.map((r) => {
    const x = r.extraction ? parseExtraction(r.extraction) : null;
    const meta = (r.channel_meta ?? {}) as { call_direction?: unknown };
    const tail = numberTail(r.from_identity);
    const triage = triageCall({
      channel: r.channel,
      status: r.status,
      disposition: r.disposition,
      ticket_id: r.ticket_id,
      body_text: r.body_text,
      duration_seconds: r.duration_seconds,
      transcript_confidence: r.transcript_confidence == null ? null : Number(r.transcript_confidence),
      spam_signals: r.spam_signals,
      matched_organization_id: r.matched_organization_id,
      match_candidates: r.match_candidates,
      extraction: x,
      internal: !!tail && ownTails.has(tail),
      ageMinutes: (Date.now() - new Date(r.received_at).getTime()) / 60_000,
    });
    const line = r.phone_line_id ? lineById.get(r.phone_line_id) : undefined;
    const tabKeys = ["all"];
    if (r.handled_by_person_id) tabKeys.push(`p:${r.handled_by_person_id}`);
    else if (line) tabKeys.push(`l:${line.id}`);
    else tabKeys.push("other");
    return {
      id: r.id,
      channel: r.channel,
      received_at: r.received_at,
      from_identity: r.from_identity,
      duration_seconds: r.duration_seconds,
      status: r.status,
      error: r.error,
      ticket_id: r.ticket_id,
      disposition: r.disposition,
      direction:
        meta.call_direction === "outgoing" ? "outgoing" : meta.call_direction === "incoming" ? "incoming" : null,
      lineName: r.handled_by_person_id
        ? (personName.get(r.handled_by_person_id) ?? null)
        : (line?.label ?? line?.endpoint_name ?? null),
      orgName: r.matched_organization_id ? (orgName.get(r.matched_organization_id) ?? null) : null,
      callerName: x?.callerName ?? null,
      summary: x?.callSummary ?? x?.problem ?? null,
      promises: x?.commitments ?? [],
      triage,
      lane: triage.lane,
      tabKeys,
    };
  });
  // Older rows only count while they are still open work.
  const all = mapped.filter((r) => !olderIds.has(r.id) || isOpenLane(r.lane));

  // Tabs: one per person who has a line (or calls), one per shared line, the
  // un-lined rest (older Twilio calls) only when there is any, and Everyone.
  const tabs: CallTab[] = [];
  if (opts.scope.all) {
    const open = (key: string) =>
      all.filter((r) => r.tabKeys.includes(key) && isOpenLane(r.lane)).length;
    const personIds = new Set<string>([
      ...lines.filter((l) => l.import_enabled).map((l) => l.person_id).filter((v): v is string => !!v),
      ...all.flatMap((r) => r.tabKeys.filter((k) => k.startsWith("p:")).map((k) => k.slice(2))),
    ]);
    for (const id of [...personIds].sort((a, b) =>
      (personName.get(a) ?? "").localeCompare(personName.get(b) ?? "", "da"),
    )) {
      tabs.push({ key: `p:${id}`, label: personName.get(id) ?? "—", open: open(`p:${id}`) });
    }
    // A shared line gets a tab only when it imports or has calls in view —
    // every colleague's line is stored (for internal-call detection), and
    // seven empty tabs would bury the two that matter.
    const linesWithCalls = new Set(all.flatMap((r) => r.tabKeys.filter((k) => k.startsWith("l:"))));
    for (const l of lines.filter((l) => !l.person_id && (l.import_enabled || linesWithCalls.has(`l:${l.id}`)))) {
      tabs.push({ key: `l:${l.id}`, label: l.label ?? l.endpoint_name ?? l.endpoint, open: open(`l:${l.id}`) });
    }
    if (all.some((r) => r.tabKeys.includes("other"))) tabs.push({ key: "other", label: "", open: open("other") });
    tabs.push({ key: "all", label: "", open: open("all") });
  }

  const validTabs = new Set(tabs.map((t) => t.key));
  const ownTab = opts.viewerId && validTabs.has(`p:${opts.viewerId}`) ? `p:${opts.viewerId}` : "all";
  const activeTab = !opts.scope.all ? "own" : opts.tab && validTabs.has(opts.tab) ? opts.tab : ownTab;
  const visible = activeTab === "own" ? all : all.filter((r) => r.tabKeys.includes(activeTab));

  const counts: Record<CallLane, number> = { todo: 0, check: 0, quiet: 0, done: 0 };
  for (const r of visible) counts[r.lane] += 1;

  return {
    tabs,
    activeTab,
    // Strip the internal tab keys before the rows reach a component.
    days: groupByDanishDay(visible.map(({ tabKeys: _t, ...row }) => (void _t, row))),
    counts,
    untilKey,
    earlierKey: fromKey,
    hasLines: lines.length > 0,
  };
}
