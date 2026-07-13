"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  TRACKED_CURRENCIES,
  fetchExternalRatesAgainstBase,
} from "@/lib/fx/fetch";
import { getOrFetchRate } from "@/lib/fx/get-or-fetch";

export type FxResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Pull today's rates for every tracked currency against DKK and upsert.
 * Frankfurter rolls back to the latest business day if today is a
 * weekend/holiday — we cache against that resolved date.
 *
 * Manual trigger from /admin/fx-rates; same code path is hit by the daily
 * Vercel Cron at /api/cron/refresh-fx-rates.
 */
export async function refreshLatestRates(): Promise<FxResult> {
  const t = await getTranslations("errors");
  const supabase = await createClient();
  // The ECB basket is quoted FROM EUR, so the cleanest call is one request
  // EUR → {all tracked currencies} and then we derive DKK pairs from it. But
  // we already store rows as <from> → DKK, so the simplest map is to query
  // each currency → DKK individually. With <=10 currencies the round-trip
  // count is fine.
  // TRACKED_CURRENCIES intentionally excludes DKK (no self-rate to fetch).
  const results: Array<{ from: string; rate: number; date: string }> = [];
  for (const from of TRACKED_CURRENCIES) {
    const fetched = await fetchExternalRatesAgainstBase(["DKK"], from, "latest");
    const rate = fetched?.rates?.DKK;
    if (!fetched || typeof rate !== "number") continue;
    results.push({ from, rate, date: fetched.rateDate });
  }

  if (results.length === 0) {
    return {
      ok: false,
      error: t("adminFxNoRatesFetched"),
    };
  }

  const { error } = await supabase.from("fx_rates").upsert(
    results.map((r) => ({
      from_currency: r.from,
      to_currency: "DKK",
      rate: r.rate,
      rate_date: r.date,
      source: "frankfurter",
    })),
    { onConflict: "from_currency,to_currency,rate_date" },
  );
  if (error) {
    return { ok: false, error: t("adminFxCouldNotSaveRates", { detail: error.message }) };
  }

  revalidatePath("/admin/fx-rates");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Refreshed ${results.length} rate${results.length === 1 ? "" : "s"} (as of ${results[0]!.date}).`,
  };
}

/**
 * Walk every PO line with a non-DKK currency, look up the rate for its
 * PO's order_date, and update fx_rate_to_dkk. Inventory_movements'
 * unit_cost_dkk is denormalised from the line at insert; we also recompute
 * those for the affected lines so the on-hand valuation stays consistent.
 *
 * Idempotent: re-running won't change rates that already match.
 */
export async function backfillHistoricalPoRates(): Promise<FxResult> {
  const t = await getTranslations("errors");
  const supabase = await createClient();

  // Pull every non-DKK PO line with its order_date.
  const { data: lines, error } = await supabase
    .from("purchase_order_lines")
    .select(
      `id, currency, fx_rate_to_dkk, unit_price, transport_pct, tariff_pct,
       purchase_order:purchase_orders!purchase_order_id(order_date)`,
    )
    .neq("currency", "DKK");
  if (error) {
    return { ok: false, error: t("adminFxCouldNotLoadPoLines", { detail: error.message }) };
  }
  if (!lines || lines.length === 0) {
    return { ok: true, message: "No non-DKK PO lines to backfill." };
  }

  let updated = 0;
  let unchanged = 0;
  let missing = 0;

  for (const line of lines) {
    const orderDate = line.purchase_order?.order_date;
    if (!orderDate) {
      missing += 1;
      continue;
    }
    const lookup = await getOrFetchRate(supabase, line.currency, "DKK", orderDate);
    if (!lookup) {
      missing += 1;
      continue;
    }
    // Round to 6dp matching the column precision so we don't churn rows on
    // floating-point fuzz.
    const newRate = Math.round(lookup.rate * 1000000) / 1000000;
    const currentRate =
      Math.round(Number(line.fx_rate_to_dkk) * 1000000) / 1000000;
    if (newRate === currentRate) {
      unchanged += 1;
      continue;
    }

    // Update the line's frozen FX. landed_cost_dkk_per_unit recomputes
    // automatically (it's GENERATED).
    const { error: updErr } = await supabase
      .from("purchase_order_lines")
      .update({
        fx_rate_to_dkk: newRate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.id);
    if (updErr) continue;

    // Recompute the unit_cost_dkk on the linked inventory_movements so
    // stock valuation reflects the historical rate.
    const additivePct = 1 + Number(line.transport_pct) + Number(line.tariff_pct);
    const newUnitCost = Number(line.unit_price) * newRate * additivePct;
    await supabase
      .from("inventory_movements")
      .update({ unit_cost_dkk: newUnitCost })
      .eq("source_entity_type", "purchase_order_line")
      .eq("source_entity_id", line.id);

    updated += 1;
  }

  revalidatePath("/admin/fx-rates");
  revalidatePath("/parts");
  return {
    ok: true,
    message: `Backfill done: ${updated} updated, ${unchanged} already correct${missing > 0 ? `, ${missing} missing (no rate available)` : ""}.`,
  };
}
