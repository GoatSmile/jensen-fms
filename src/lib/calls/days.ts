/**
 * Calls grouped by DANISH calendar day, newest first, with the fold rule.
 *
 * Days are cut in Europe/Copenhagen, never UTC: a call at 00:30 Danish time is
 * that day's first call, not the previous day's last (the server runs in UTC).
 *
 * Fold rule — the page's promise: **a day with work left is never folded.**
 * Open = the most recent day that has calls, plus every day still holding a
 * `todo` or `check`. A day where everything is done or quiet folds to one line.
 */
import { isOpenLane, type CallLane } from "./triage";

export const DANISH_TZ = "Europe/Copenhagen";

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: DANISH_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-09-29" for an instant, in Danish time. */
export function danishDayKey(iso: string | Date): string {
  return dayKeyFormat.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** The day key `days` days before `key` (calendar arithmetic, DST-safe). */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export type DayGroup<T> = {
  key: string;
  items: T[];
  counts: Record<CallLane, number>;
  /** Items in `todo` or `check`. */
  open: number;
  expanded: boolean;
};

export function groupByDanishDay<T extends { received_at: string; lane: CallLane }>(
  rows: T[],
): DayGroup<T>[] {
  const byDay = new Map<string, T[]>();
  for (const r of rows) {
    const k = danishDayKey(r.received_at);
    const list = byDay.get(k);
    if (list) list.push(r);
    else byDay.set(k, [r]);
  }
  const keys = [...byDay.keys()].sort().reverse();
  return keys.map((key, i) => {
    const items = byDay.get(key)!.sort((a, b) => b.received_at.localeCompare(a.received_at));
    const counts: Record<CallLane, number> = { todo: 0, check: 0, quiet: 0, done: 0 };
    for (const it of items) counts[it.lane] += 1;
    const open = items.filter((it) => isOpenLane(it.lane)).length;
    return { key, items, counts, open, expanded: i === 0 || open > 0 };
  });
}

const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DANISH_TZ,
  timeZoneName: "longOffset",
  year: "numeric",
});

/** The instant Danish midnight begins on day `key` ("2026-09-29") — DST-aware. */
export function danishMidnight(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  // Guess at UTC midnight, read Copenhagen's offset there, correct once; a
  // second read catches the two DST-change nights.
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 2; i++) {
    const name = offsetFormat.formatToParts(new Date(t)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const mm = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    const offsetMin = mm ? (mm[1] === "-" ? -1 : 1) * (Number(mm[2]) * 60 + Number(mm[3] ?? 0)) : 0;
    t = Date.UTC(y, m - 1, d) - offsetMin * 60_000;
  }
  return new Date(t);
}

const timeFormat = new Intl.DateTimeFormat("da-DK", {
  timeZone: DANISH_TZ,
  hour: "2-digit",
  minute: "2-digit",
});

/** "15.01" — a call's time of day, in Danish time. */
export function danishTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** "tirsdag 29. sep." / "Tuesday 29 Sep" — a day heading, in the UI language. */
export function dayHeading(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
    timeZone: DANISH_TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(`${key}T12:00:00Z`));
}
