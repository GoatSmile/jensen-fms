"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readPersonId } from "@/lib/auth/read-session";
import {
  outboundCostFields,
  resolveUnitCost,
} from "@/lib/inventory/unit-cost";
import { createClient } from "@/lib/supabase/server";

/**
 * The base part behind a painted variant, or null when this part is a base
 * itself. Only used to widen revalidation — a failure here must not fail the
 * adjustment, which has already been written.
 */
async function loadBasePartId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("parts")
    .select("base_part_id")
    .eq("id", partId)
    .maybeSingle();
  return data?.base_part_id ?? null;
}

export type AdjustStockInput = {
  partId: string;
  locationId: string;
  mode: "delta" | "set";
  /** Signed delta (mode='delta') or absolute target (mode='set'). */
  value: number;
  reason: string;
  /**
   * Landed-cost-per-unit in DKK. REQUIRED when the adjustment adds stock
   * (migration 88); must be omitted when it removes stock, which inherits the
   * prevailing cost instead.
   */
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

export type AdjustStockResult = { ok: true } | { ok: false; error: string };

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

  // Cost is direction-dependent, and this is the whole point of migration 88.
  //
  // Stock COMING IN must say what it cost — that is the found-in-storage case,
  // and letting it through uncosted is what left 499 baskets valued at zero and
  // a bike built from them missing its parts cost. The dialog pre-fills the
  // prevailing figure, so a plain recount is one click, not a research task.
  //
  // Stock GOING OUT inherits the prevailing cost and is never asked. Nobody can
  // answer "what was the broken one worth?", and asking invites a made-up
  // number into the ledger.
  let costFields: {
    unit_cost_dkk: number | null;
    unit_cost_basis: "purchase" | "stated" | "derived" | "none";
  };
  if (delta > 0) {
    if (unitCostDkk == null) {
      return { ok: false, error: t("partUnitCostRequiredOnIncrease") };
    }
    if (unitCostDkk < 0) {
      return { ok: false, error: t("partUnitCostNonNegative") };
    }
    costFields = { unit_cost_dkk: unitCostDkk, unit_cost_basis: "stated" };
  } else {
    if (unitCostDkk != null) {
      return { ok: false, error: t("partUnitCostOnDecrease") };
    }
    costFields = outboundCostFields(
      await resolveUnitCost(supabase, input.partId),
    );
  }

  const personId = await readPersonId();
  const { error: insertErr } = await supabase
    .from("inventory_movements")
    .insert({
      part_id: input.partId,
      location_id: input.locationId,
      movement_type: "adjustment",
      quantity_delta: delta,
      ...costFields,
      reason: costProvenance ? `${reason} · ${costProvenance}` : reason,
      created_by: personId,
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
  // A painted variant's count is ALSO read on two other surfaces: its base
  // part's "Painted stock" panel and the paint shelf. Without these, adjusting
  // a variant left both showing the old number — silently, because nothing
  // errors. Found 2026-09-03 with JP-LS2b-RED at 13 in the ledger and 11 on
  // its base part's page.
  revalidatePath("/parts/painted");
  const basePartId = await loadBasePartId(supabase, input.partId);
  if (basePartId) revalidatePath(`/parts/${basePartId}`);

  return { ok: true };
}
