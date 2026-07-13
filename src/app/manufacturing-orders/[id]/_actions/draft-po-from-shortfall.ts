"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { loadMOCoverage } from "@/lib/manufacturing/coverage";
import { createDraftPOsForDemand } from "@/lib/purchasing/draft-pos";

export type DraftPOResult =
  | {
      ok: true;
      pos: { id: string; poNumber: string; supplierName: string; lines: number }[];
      /** Shortfall parts that couldn't be placed on any PO. */
      skipped: { sku: string; name: string; reason: string }[];
    }
  | { ok: false; error: string };

/**
 * Turn an MO's stock shortfall into draft purchase orders — one PO per
 * supplier, via the shared demand→draft-PO engine (`lib/purchasing/
 * draft-pos.ts`: offering choice, MOQ rounding, FX/tariff/anti-dumping/
 * transport snapshots, traceability notes). The POs stay in draft:
 * review, adjust, then place them from /purchase-orders.
 */
export async function draftPOsFromShortfall(
  moId: string,
): Promise<DraftPOResult> {
  const t = await getTranslations("errors");
  if (!moId) return { ok: false, error: t("missingMoId") };

  const supabase = await createClient();

  const { data: mo } = await supabase
    .from("manufacturing_orders")
    .select("id, mo_number, status")
    .eq("id", moId)
    .maybeSingle();
  if (!mo) return { ok: false, error: t("moNotFound") };
  if (mo.status === "completed" || mo.status === "cancelled") {
    return { ok: false, error: t("moNothingToBuy", { status: mo.status }) };
  }

  const coverage = await loadMOCoverage(supabase, moId);
  if ("error" in coverage) return { ok: false, error: coverage.error };
  if (coverage.shortfallRows.length === 0) {
    return { ok: false, error: t("moNoShortfall") };
  }

  const result = await createDraftPOsForDemand(
    supabase,
    coverage.shortfallRows.map((row) => ({
      partId: row.partId,
      sku: row.sku,
      name: row.name,
      quantity: row.shortfall,
      lineNote: `Shortfall for ${mo.mo_number}: need ${row.demand}, on hand ${row.onHand}.`,
    })),
    `Drafted from ${mo.mo_number} stock shortfall (${coverage.remainingToBuild} bikes to build).`,
  );
  if (!result.ok) return result;

  revalidatePath("/purchase-orders");
  revalidatePath(`/manufacturing-orders/${moId}`);
  return result;
}
