/**
 * Format helpers for the workshop-mode status banner and queue cards.
 *
 * Both helpers are word-free — they return only times and durations
 * ("14:32", "23 min", "1h 12m") so the screens can wrap them in
 * localized copy ("Started {time} · {elapsed} ago" / "Startet {time} ·
 * {elapsed} siden"). Unit abbreviations (min/h/d) are kept as-is; they
 * read fine in both Danish and English.
 *
 * Both compute server-side at render — they don't tick in real time.
 * Refresh updates them; that's fine for v1.
 */

/**
 * Bare clock time when the timestamp is today ("14:32"), date + time
 * otherwise ("05/07 14:32"). 24-hour.
 */
export function atTimeLabel(iso: string, nowMs: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date(nowMs);
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (isSameDay) return time;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}

/**
 * Short duration since `iso` ("23 min", "1h 12m", "2d"). Rounded to the
 * nearest minute; floors below a minute as "<1 min" because anything
 * finer is noise on the workshop floor.
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
