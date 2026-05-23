/**
 * Format helpers for the workshop-mode status banner.
 *
 * `elapsedSince` returns a human "23 min ago" / "1h 12m ago" / "2d ago"
 * label. Rounded to the nearest minute; floors below a minute as
 * "<1 min ago" because anything finer is noise on the workshop floor.
 *
 * `startedAtLabel` returns a short clock time when the WO started today
 * and falls back to date+time for older starts. Danish locale, 24-hour.
 *
 * Both compute server-side at render — they don't tick in real time.
 * Refresh updates them; that's fine for v1.
 */

export function elapsedSince(iso: string, nowMs: number = Date.now()): string {
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) return "";
  const diffMin = Math.max(0, Math.floor((nowMs - start) / 60_000));
  if (diffMin < 1) return "<1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  if (hours < 24) {
    return minutes === 0 ? `${hours}h ago` : `${hours}h ${minutes}m ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function startedAtLabel(
  iso: string,
  nowMs: number = Date.now(),
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date(nowMs);
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (isSameDay) return `Started ${time}`;
  return `Started ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}

/**
 * Combined "Started 14:32 · 23 min ago" used in the workspace status
 * banner. Returns the started-at portion alone for terminal states
 * (completed/cancelled) where "ago" isn't meaningful.
 */
export function startedFullLabel(
  iso: string,
  opts: { includeElapsed?: boolean } = {},
  nowMs: number = Date.now(),
): string {
  const at = startedAtLabel(iso, nowMs);
  if (opts.includeElapsed === false) return at;
  const ago = elapsedSince(iso, nowMs);
  return ago ? `${at} · ${ago}` : at;
}

/**
 * Short pill label for the queue card ("23 min", "1h 12m"). Drops the
 * "ago" because the surrounding context (the queue, where the WO is
 * actively running) makes it obvious.
 */
export function elapsedShort(
  iso: string,
  nowMs: number = Date.now(),
): string {
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) return "";
  const diffMin = Math.max(0, Math.floor((nowMs - start) / 60_000));
  if (diffMin < 1) return "<1 min";
  if (diffMin < 60) return `${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  if (hours < 24) {
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
