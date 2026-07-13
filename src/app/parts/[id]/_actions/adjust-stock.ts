"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

export type AdjustStockInput = {
  partId: string;
  locationId: string;
  mode: "delta" | "set";
  /** Signed delta (mode='delta') or absolute target (mode='set'). */
  value: number;
  reason: string;
  /** Optional landed-cost-per-unit in DKK; only meaningful when adding stock. */
  unitCostDkk: number | null;
  /**
   * Alternative to `unitCostDkk` — the original foreign amount plus the FX
   * rate the dialog looked up (or the user overrode) for the purchase date.
   * The server computes `unit_cost_dkk = amount × fxRate` and appends the
   * original amount/rate to the reason, since `inventory_movements` has no
   * currency columns — the ledger stays DKK, the provenance stays readable.
   * Mutually exclusive with `unitCostDkk`.
   */
  unitCostForeign?: {
    amount: number;
    /** ISO 4217, e.g. "USD". Never "DKK" — that's the plain path. */
    currency: string;
    fxRate: number;
    /** ECB quote date actually used (may differ from the purchase date). */
    rateDate?: string | null;
  } | null;
  /**
   * Optional back-dated ledger date (ISO `yyyy-mm-dd`). Lets historical stock
   * (e.g. parts bought years ago) land in the right period rather than today.
   * When omitted/empty, `inventory_movements.occurred_at` defaults to `now()`.
   */
  occurredAt?: string | null;
};

export type AdjustStockResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Append a single `inventory_movements` row of type `adjustment`.
 *
 * The current on-hand for the (part, location) is read first so we can
 *   - translate `mode='set'` into a signed delta, and
 *   - reject adjustments that would drive on-hand negative.
 *
 * There is a small read-then-write race: another adjustment landing between
 * those two steps could let us write a delta that's stale by the time it lands.
 * For a single-shop FMS this is acceptable; correcting drift is itself just
 * another adjustment. When multi-user concurrency arrives, push this into a
 * Postgres function so the read and write happen atomically.
 *
 * Uses the publishable-key Supabase client. RLS is deferred (per CLAUDE.md);
 * once it lands, this action will need either a service-role client or an
 * authenticated session.
 */
export async function adjustStock(
  input: AdjustStockInput,
): Promise<AdjustStockResult> {
  const t = await getTranslations("errors");
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, error: t("partReasonRequired") };
  }
  if (!Number.isFinite(input.value)) {
    return { ok: false, error: t("partQtyNumber") };
  }
  if (input.unitCostDkk != null && !Number.isFinite(input.unitCostDkk)) {
    return { ok: false, error: t("partUnitCostNumberOrEmpty") };
  }

  // Foreign-cost path: DKK is computed here (not trusted from the client
  // arithmetic) and the original amount + rate ride along in the reason.
  let unitCostDkk = input.unitCostDkk ?? null;
  let costProvenance: string | null = null;
  const foreign = input.unitCostForeign ?? null;
  if (foreign) {
    if (unitCostDkk != null) {
      return {
        ok: false,
        error: t("partUnitCostDkkOrForeign"),
      };
    }
    if (!Number.isFinite(foreign.amount) || foreign.amount < 0) {
      return { ok: false, error: t("partUnitCostNonNegative") };
    }
    if (!Number.isFinite(foreign.fxRate) || foreign.fxRate <= 0) {
      return { ok: false, error: t("partFxRatePositive") };
    }
    const currency = foreign.currency.trim().toUpperCase();
    if (currency.length !== 3 || currency === "DKK") {
      return { ok: false, error: t("partPickForeignCurrency") };
    }
    // Same 4-dp rounding as the PO landed-cost money convention.
    unitCostDkk = Math.round(foreign.amount * foreign.fxRate * 10000) / 10000;
    costProvenance = `Cost ${foreign.amount} ${currency} @ ${foreign.fxRate}${
      foreign.rateDate ? ` (ECB ${foreign.rateDate})` : ""
    } = ${unitCostDkk} DKK/unit.`;
  }

  // Optional back-date. Accept an ISO `yyyy-mm-dd`; reject garbage and future
  // dates (a ledger entry dated in the future would misreport as-of stock).
  let occurredAt: string | null = null;
  const rawDate = input.occurredAt?.trim();
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: t("partPurchaseDateInvalid") };
    }
    // Compare on the calendar day (today's date is still allowed).
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (parsed.getTime() > today.getTime()) {
      return { ok: false, error: t("partPurchaseDateFuture") };
    }
    occurredAt = rawDate;
  }

  const supabase = await createClient();

  // Read current on-hand at this location. v_current_stock has at most one row
  // per (part, location); when there's no movement history yet the view simply
  // returns nothing — that's a starting balance of zero.
  const { data: stockRow, error: stockErr } = await supabase
    .from("v_current_stock")
    .select("quantity_on_hand")
    .eq("part_id", input.partId)
    .eq("location_id", input.locationId)
    .maybeSingle();

  if (stockErr) {
    return {
      ok: false,
      error: t("partCouldNotReadStock", { detail: stockErr.message }),
    };
  }

  const currentOnHand = Number(stockRow?.quantity_on_hand ?? 0);

  let delta: number;
  if (input.mode === "delta") {
    delta = input.value;
  } else {
    // mode === 'set'
    if (input.value < 0) {
      return { ok: false, error: t("partTargetOnHandNegative") };
    }
    delta = input.value - currentOnHand;
  }

  if (delta === 0) {
    return {
      ok: false,
      error: t("partAdjustmentNoChange"),
    };
  }

  const projected = currentOnHand + delta;
  if (projected < 0) {
    return {
      ok: false,
      error: t("partAdjustmentBelowZero", { projected }),
    };
  }

  const { error: insertErr } = await supabase.from("inventory_movements").insert({
    part_id: input.partId,
    location_id: input.locationId,
    movement_type: "adjustment",
    quantity_delta: delta,
    unit_cost_dkk: unitCostDkk,
    reason: costProvenance ? `${reason} · ${costProvenance}` : reason,
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
  });

  if (insertErr) {
    return {
      ok: false,
      error: t("partCouldNotWriteAdjustment", { detail: insertErr.message }),
    };
  }

  // The list page summarises stock; the detail page reads movements + stock.
  revalidatePath("/parts");
  revalidatePath(`/parts/${input.partId}`);

  return { ok: true };
}
