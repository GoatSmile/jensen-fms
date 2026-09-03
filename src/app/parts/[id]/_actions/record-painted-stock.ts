"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readPersonId } from "@/lib/auth/read-session";
import { outboundCostFields, resolveUnitCost } from "@/lib/inventory/unit-cost";
import { findOrCreatePaintedVariant } from "@/lib/parts/painted-variants";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

export type RecordPaintedStockInput = {
  basePartId: string;
  colorId: string;
  locationId: string;
  /** Always positive — this records stock found, never stock removed. */
  quantity: number;
  /**
   * What one painted piece is worth. REQUIRED: inbound stock must carry a cost
   * (migration 88), and a free item is an explicit 0, not a blank.
   */
  unitCostDkk: number;
  reason: string;
  /** Back-date for a batch painted months ago; null = today. */
  occurredOn: string | null;
  /**
   * Whether these pieces should ALSO come off the raw count.
   *
   * Never defaulted on (owner's call, 2026-09-03). Both answers are right in
   * different situations and the wrong one is silent:
   * - TRUE is a conversion we never recorded: the pieces left as raw stock, went
   *   to a painter off-system, and came back painted. Posting only the painted
   *   half would inflate total inventory by the quantity.
   * - FALSE is a physical count: the shelf is being reconciled and the raw
   *   figure is being corrected separately. Taking them off raw as well would
   *   double-subtract.
   */
  takeOffRaw: boolean;
};

export type RecordPaintedStockResult =
  | { ok: true; variantId: string; variantCreated: boolean }
  | { ok: false; error: string; field?: string };

/**
 * Put painted stock on the shelf by hand, creating the colour's variant if it
 * does not exist yet.
 *
 * Until now `findOrCreatePaintedVariant` had exactly ONE caller — a paint order
 * reaching `received_back`. So painted parts the shop already owned in a colour
 * that never went through the app could not be recorded at all: there was no
 * row to adjust and no way to make one (DECISIONS 2026-09-03). This is that
 * way, and it is deliberately the only other door.
 *
 * The movement type follows the ANSWER to `takeOffRaw`, because they are
 * genuinely different events:
 * - `takeOffRaw` ⇒ `paint_out` on the base + `paint_in` on the variant, the
 *   same balanced pair `convertPaintedStock` writes. A conversion happened; we
 *   are recording it late.
 * - otherwise ⇒ a single `adjustment` on the variant. Nothing converted in our
 *   books, and a `paint_in` with no `paint_out` behind it would leave the paint
 *   ledger unable to explain itself.
 *
 * The variant's cost is `stated` in both branches — a human typed it — so
 * `v_part_last_cost` shows it as an estimate (`≈ … (stated)`) rather than
 * dressing it as an invoice.
 */
export async function recordPaintedStock(
  input: RecordPaintedStockInput,
): Promise<RecordPaintedStockResult> {
  const t = await getTranslations("errors");

  if (!input.basePartId) return { ok: false, error: t("missingPartId") };
  if (!input.colorId) {
    return { ok: false, error: t("paintedPickColour"), field: "color_id" };
  }
  if (!input.locationId) {
    return { ok: false, error: t("poPickLocation"), field: "location_id" };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: t("paintedQtyPositive"), field: "quantity" };
  }
  if (!Number.isFinite(input.unitCostDkk) || input.unitCostDkk < 0) {
    return { ok: false, error: t("paintedCostRequired"), field: "unit_cost" };
  }
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, error: t("partReasonRequired"), field: "reason" };
  }

  const supabase = await createClient();
  const actorId = await readPersonId();

  // The base must be a raw part. A variant here would mean "paint the painted
  // one", which is a repaint and belongs on a paint order.
  const { data: base, error: baseErr } = await supabase
    .from("parts")
    .select("id, internal_sku, base_part_id, deleted_at")
    .eq("id", input.basePartId)
    .maybeSingle();
  if (baseErr || !base) {
    return {
      ok: false,
      error: t("couldNotLoad", { detail: baseErr?.message ?? t("notFound") }),
    };
  }
  if (base.deleted_at) return { ok: false, error: t("paintedBaseDeleted") };
  if (base.base_part_id) return { ok: false, error: t("paintedBaseIsVariant") };

  // Taking them off raw cannot drive the raw count negative — the pieces have
  // to have been there to have been painted.
  if (input.takeOffRaw) {
    const { data: rawStock } = await supabase
      .from("v_current_stock")
      .select("quantity_on_hand")
      .eq("part_id", input.basePartId)
      .eq("location_id", input.locationId);
    const rawOnHand = (rawStock ?? []).reduce(
      (sum, r) => sum + Number(r.quantity_on_hand ?? 0),
      0,
    );
    if (rawOnHand < input.quantity) {
      return {
        ok: false,
        error: t("paintedNotEnoughRaw", {
          raw: rawOnHand,
          qty: input.quantity,
        }),
        field: "take_off_raw",
      };
    }
  }

  const variant = await findOrCreatePaintedVariant(
    supabase,
    input.basePartId,
    input.colorId,
  );
  if (!variant.ok) {
    return {
      ok: false,
      error: t("paintedCouldNotCreateVariant", { detail: variant.error }),
    };
  }

  const occurredAt = input.occurredOn
    ? new Date(`${input.occurredOn}T12:00:00Z`).toISOString()
    : new Date().toISOString();

  type MovementInsert =
    Database["public"]["Tables"]["inventory_movements"]["Insert"];
  const rows: MovementInsert[] = [
    {
      part_id: variant.variantId,
      location_id: input.locationId,
      movement_type: input.takeOffRaw ? "paint_in" : "adjustment",
      quantity_delta: input.quantity,
      unit_cost_dkk: input.unitCostDkk,
      unit_cost_basis: "stated",
      reason,
      occurred_at: occurredAt,
      created_by: actorId,
    },
  ];

  if (input.takeOffRaw) {
    // The raw half inherits the base part's prevailing cost and freezes it —
    // the same rule every other outbound movement follows.
    const rawCost = await resolveUnitCost(supabase, base.id);
    rows.push({
      part_id: base.id,
      location_id: input.locationId,
      movement_type: "paint_out",
      quantity_delta: -input.quantity,
      ...outboundCostFields(rawCost),
      reason,
      occurred_at: occurredAt,
      created_by: actorId,
    });
  }

  const { error: insErr } = await supabase
    .from("inventory_movements")
    .insert(rows);
  if (insErr) {
    return {
      ok: false,
      error: t("partCouldNotWriteAdjustment", { detail: insErr.message }),
    };
  }

  revalidatePath("/parts");
  revalidatePath("/parts/painted");
  revalidatePath(`/parts/${input.basePartId}`);
  revalidatePath(`/parts/${variant.variantId}`);

  return {
    ok: true,
    variantId: variant.variantId,
    variantCreated: variant.created,
  };
}
