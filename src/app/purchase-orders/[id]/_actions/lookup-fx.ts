"use server";

import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getOrFetchRate } from "@/lib/fx/get-or-fetch";

export type FxLookupResult =
  | {
      ok: true;
      rate: number;
      /** ECB skips weekends/holidays; the actual quote date may be earlier. */
      actualDate: string;
      source: "cache" | "frankfurter";
    }
  | { ok: false; error: string };

/**
 * Look up the (from → DKK) rate for a specific date. Used by the PO line
 * dialog to pre-fill fx_rate_to_dkk with the rate that was effective on
 * the PO's order_date — matching how Dennis books historical purchases.
 *
 * Same as the daily-cron path: cache-first, fall through to Frankfurter,
 * upsert into fx_rates on miss.
 */
export async function lookupFxRate(
  fromCurrency: string,
  toCurrency: string,
  date: string,
): Promise<FxLookupResult> {
  const t = await getTranslations("errors");
  if (!fromCurrency || !toCurrency || !date) {
    return { ok: false, error: t("poMissingCurrencyOrDate") };
  }
  const supabase = await createClient();
  const lookup = await getOrFetchRate(supabase, fromCurrency, toCurrency, date);
  if (!lookup) {
    return {
      ok: false,
      error: t("poNoFxRate", { from: fromCurrency, to: toCurrency, date }),
    };
  }
  return {
    ok: true,
    rate: lookup.rate,
    actualDate: lookup.actualDate,
    source: lookup.source,
  };
}
