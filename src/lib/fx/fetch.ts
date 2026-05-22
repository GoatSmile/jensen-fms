/**
 * Frankfurter.app — free ECB reference-rate proxy. No API key, history back
 * to 1999, daily updates ~16:00 CET (after ECB's fix). For Denmark this is
 * the same data Nationalbanken publishes as the official daily fixing.
 *
 * Endpoints we use:
 *   GET https://api.frankfurter.app/latest?from=USD&to=DKK
 *   GET https://api.frankfurter.app/2024-05-14?from=USD&to=DKK
 *   GET https://api.frankfurter.app/2024-05-14?from=EUR&to=USD,GBP,SEK,NOK
 *
 * Quirks:
 *   - ECB doesn't publish on weekends or holidays. If you ask for a date
 *     they don't have, Frankfurter falls back to the most recent business
 *     day; the response's `date` field tells you which one. We store
 *     against the actual returned date (not the requested one) so callers
 *     can decide whether that's acceptable.
 *   - Pairs not in the ECB basket (e.g. CNY/DKK) are computed via cross-
 *     rate through EUR, no extra work needed on our side.
 */

// Note: api.frankfurter.app 301-redirects to api.frankfurter.dev/v1 as of
// 2025. Call the new host directly so we don't pay the redirect round-trip
// (and so non-redirect-following clients keep working).
const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

/** Set of currencies we keep up-to-date by default. */
export const TRACKED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "SEK",
  "NOK",
  "CHF",
  "PLN",
  "CNY",
] as const;
export type TrackedCurrency = (typeof TRACKED_CURRENCIES)[number];

export type FrankfurterRate = {
  /** What we asked for (or what the API returned, if our date was a weekend). */
  rateDate: string;
  /** The actual rate, multiplier from `from` to `to`. */
  rate: number;
};

/** Fetch a single rate for a (from → to) pair, optionally on a specific date. */
export async function fetchExternalRate(
  from: string,
  to: string,
  date: string | "latest" = "latest",
): Promise<FrankfurterRate | null> {
  if (from === to) {
    return { rateDate: date === "latest" ? todayISO() : date, rate: 1 };
  }
  const path = date === "latest" ? "latest" : date;
  const url = `${FRANKFURTER_BASE}/${path}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, {
    // Force fresh fetch — caching is our job downstream.
    cache: "no-store",
  });
  if (!res.ok) {
    return null;
  }
  const json = (await res.json()) as {
    amount: number;
    base: string;
    date: string;
    rates: Record<string, number>;
  };
  const rate = json.rates?.[to];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    return null;
  }
  return { rateDate: json.date, rate };
}

/**
 * Fetch the latest rates for several currencies against a single base. Uses
 * Frankfurter's multi-`to` form so all currencies come back in one HTTP
 * round-trip. We default to DKK as the target since that's the only currency
 * the workshop ever cares about converting *into*.
 */
export async function fetchExternalRatesAgainstBase(
  currencies: readonly string[],
  base: string,
  date: string | "latest" = "latest",
): Promise<{
  rateDate: string;
  rates: Record<string, number>;
} | null> {
  const targets = currencies.filter((c) => c !== base);
  if (targets.length === 0) {
    return { rateDate: date === "latest" ? todayISO() : date, rates: {} };
  }
  const path = date === "latest" ? "latest" : date;
  const url = `${FRANKFURTER_BASE}/${path}?from=${encodeURIComponent(base)}&to=${encodeURIComponent(targets.join(","))}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    date: string;
    rates: Record<string, number>;
  };
  return { rateDate: json.date, rates: json.rates ?? {} };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
