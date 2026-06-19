/**
 * ISO-8601 week helpers for delivery targets expressed as a week rather than
 * an exact date. We store the Monday of the chosen ISO week in the existing
 * date column and a precision flag alongside it; these convert both ways.
 *
 * All maths is done in UTC against date-only "YYYY-MM-DD" strings so a
 * timezone never shifts the day across a boundary.
 */

export type DeliveryPrecision = "exact" | "week";

function parseUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function formatUtcIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO week number + ISO week-year for a "YYYY-MM-DD" date. */
export function isoWeekOf(iso: string): { year: number; week: number } {
  const date = parseUtc(iso);
  // Shift to the Thursday of this week — ISO weeks belong to the year of their
  // Thursday.
  const dayMon0 = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayMon0 + 3);
  const thursdayYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(thursdayYear, 0, 4));
  const firstDayMon0 = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayMon0 + 3);
  const week =
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000),
    );
  return { year: thursdayYear, week };
}

/** Monday (as "YYYY-MM-DD") of a given ISO week-year + week number. */
export function mondayOfIsoWeek(year: number, week: number): string {
  // Jan 4th is always in ISO week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Mon0 = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Mon0);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return formatUtcIso(monday);
}

/** Highest valid ISO week number in a year (52 or 53). */
export function weeksInIsoYear(year: number): number {
  return isoWeekOf(`${year}-12-28`).week; // Dec 28 is always in the last week.
}

/**
 * Human delivery target. precision==='week' → "week 28 2026" / "uge 28 2026";
 * otherwise the exact date in the locale. Returns null for no date.
 */
export function formatDeliveryTarget(
  iso: string | null | undefined,
  precision: string | null | undefined,
  lang: "en" | "da" = "en",
): string | null {
  if (!iso) return null;
  if (precision === "week") {
    const { year, week } = isoWeekOf(iso);
    return lang === "da" ? `uge ${week} ${year}` : `week ${week} ${year}`;
  }
  return new Intl.DateTimeFormat(lang === "da" ? "da-DK" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseUtc(iso));
}
