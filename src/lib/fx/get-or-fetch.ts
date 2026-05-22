/**
 * DB-cached FX lookup. Checks the fx_rates table first; if no row exists
 * for the requested (from, to, date), fetches from Frankfurter and upserts.
 * Subsequent calls for the same triple are served from the DB.
 *
 * Used by:
 *   - The PO line dialog when an order_date + foreign currency are known.
 *   - The historical-backfill admin action to fill in old PO lines.
 *   - The daily refresh cron.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchExternalRate } from "./fetch";

export type RateLookup = {
  rate: number;
  /** ECB doesn't quote weekends/holidays; the resolved date may be earlier. */
  actualDate: string;
  source: "cache" | "frankfurter";
};

/** Look up (from → to) rate as of `date`. Uses fx_rates cache first. */
export async function getOrFetchRate(
  supabase: SupabaseClient,
  from: string,
  to: string,
  date: string,
): Promise<RateLookup | null> {
  if (from === to) {
    return { rate: 1, actualDate: date, source: "cache" };
  }

  // Cache hit: same currency pair on the same business day.
  const { data: exact } = await supabase
    .from("fx_rates")
    .select("rate, rate_date")
    .eq("from_currency", from)
    .eq("to_currency", to)
    .eq("rate_date", date)
    .maybeSingle();
  if (exact) {
    return {
      rate: Number(exact.rate),
      actualDate: exact.rate_date,
      source: "cache",
    };
  }

  // Cache miss: try Frankfurter. They roll back to the most recent business
  // day if the asked-for date is a weekend/holiday — we cache against that
  // actual date so the next call hits.
  const fetched = await fetchExternalRate(from, to, date);
  if (!fetched) return null;

  await supabase.from("fx_rates").upsert(
    {
      from_currency: from,
      to_currency: to,
      rate: fetched.rate,
      rate_date: fetched.rateDate,
      source: "frankfurter",
    },
    { onConflict: "from_currency,to_currency,rate_date" },
  );

  return {
    rate: fetched.rate,
    actualDate: fetched.rateDate,
    source: "frankfurter",
  };
}
