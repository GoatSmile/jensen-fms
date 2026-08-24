"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { resolveDefaultLocationId } from "@/lib/inventory/default-location";
import { readPersonId } from "@/lib/auth/read-session";
import { createClient } from "@/lib/supabase/server";
import {
  CLOSED_WO_STATUSES,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";

export type WOPartsResult = { ok: true } | { ok: false; error: string };

export type WOKitAddResult =
  { ok: true; added: number; skipped: number } | { ok: false; error: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function revalidateWOPaths(woId: string) {
  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${woId}`);
  revalidatePath(`/work/${woId}`);
  revalidatePath(`/work/${woId}/parts`);
  revalidatePath("/parts");
}

/**
 * Load + gate a work order for parts mutations. Returns the WO row or an
 * error result when missing/closed.
 */
async function loadOpenWO(
  supabase: SupabaseServerClient,
  woId: string,
): Promise<
  | { ok: true; wo: { id: string; status: string; bike_id: string | null } }
  | { ok: false; error: string }
> {
  const t = await getTranslations("errors");
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, status, bike_id")
    .eq("id", woId)
    .maybeSingle();
  if (woErr || !wo) {
    return {
      ok: false,
      error: t("woCouldNotLoad", { detail: woErr?.message ?? t("notFound") }),
    };
  }
  if (CLOSED_WO_STATUSES.includes(wo.status as WorkOrderStatus)) {
    return {
      ok: false,
      error: t("woClosedParts"),
    };
  }
  return { ok: true, wo };
}

/** Primary inventory location, else first active by code (shared resolver). */
async function defaultLocation(
  supabase: SupabaseServerClient,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return resolveDefaultLocationId(supabase);
}

/**
 * Core insert shared by the single-add and kit bulk-add paths:
 *
 *   1. Insert inventory_movements (consumed_maintenance, negative qty).
 *   2. Insert work_order_parts pointing at that movement.
 *   3. Patch the movement's source_entity_id with the new wo_parts.id so the
 *      ledger traces back both ways.
 *
 * Defensively traps the (work_order_id, part_id) collision (23505) in case
 * the DB has the unique constraint configured.
 */
async function consumePartOntoWO(
  supabase: SupabaseServerClient,
  woId: string,
  locationId: string,
  partId: string,
  qty: number,
  unitPrice: number | null,
): Promise<WOPartsResult> {
  const t = await getTranslations("errors");
  const personId = await readPersonId();
  // Insert the movement first; source_entity_id gets patched after the
  // wo_parts row exists.
  const { data: movement, error: movErr } = await supabase
    .from("inventory_movements")
    .insert({
      part_id: partId,
      location_id: locationId,
      movement_type: "consumed_maintenance",
      quantity_delta: -qty,
      unit_cost_dkk: unitPrice,
      source_entity_type: "work_order_part",
      source_entity_id: null,
      reason: `Work order ${woId}`,
      created_by: personId,
    })
    .select("id")
    .single();
  if (movErr || !movement) {
    return {
      ok: false,
      error: t("woCouldNotWriteMovement", {
        detail: movErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { data: woPart, error: wopErr } = await supabase
    .from("work_order_parts")
    .insert({
      work_order_id: woId,
      part_id: partId,
      quantity: qty,
      unit_price: unitPrice,
      inventory_movement_id: movement.id,
    })
    .select("id")
    .single();
  if (wopErr || !woPart) {
    // Compensating delete: tear down the movement we just wrote so a failed
    // add doesn't leave a phantom consumption on the ledger.
    await supabase.from("inventory_movements").delete().eq("id", movement.id);
    if (wopErr?.code === "23505") {
      return {
        ok: false,
        error: t("woPartAlreadyOn"),
      };
    }
    return {
      ok: false,
      error: t("woCouldNotRecordPart", {
        detail: wopErr?.message ?? t("unknownError"),
      }),
    };
  }

  // Backlink the movement to the wo_parts row.
  await supabase
    .from("inventory_movements")
    .update({ source_entity_id: woPart.id })
    .eq("id", movement.id);

  return { ok: true };
}

/**
 * Add a part to a work order. Refuses when the WO is completed or cancelled.
 */
export async function addPartToWO(
  woId: string,
  formData: FormData,
): Promise<WOPartsResult> {
  const t = await getTranslations("errors");
  if (!woId) return { ok: false, error: t("missingWorkOrderId") };

  const partId = nullable(formData.get("part_id"));
  const qtyRaw = nullable(formData.get("quantity"));
  const unitPriceRaw = nullable(formData.get("unit_price"));

  if (!partId) return { ok: false, error: t("woPickPart") };
  const qty = Number(qtyRaw);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: t("positiveQty") };
  }

  const supabase = await createClient();
  const gate = await loadOpenWO(supabase, woId);
  if (!gate.ok) return gate;

  const location = await defaultLocation(supabase);
  if (!location.ok) return location;

  // Retail fallback for unit_price — work_order_parts.unit_price is the
  // customer-facing (retail) snapshot: it's what technicians see and what
  // invoicing (3D) will bill. Internal cost stays on the inventory
  // movement (unit_cost_dkk), so the ledger is unaffected.
  let unitPrice: number | null = null;
  if (unitPriceRaw != null) {
    const n = Number(unitPriceRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: t("woUnitPriceNonNegative") };
    }
    unitPrice = n;
  } else {
    const { data: part } = await supabase
      .from("parts")
      .select("default_retail_price, default_retail_currency")
      .eq("id", partId)
      .maybeSingle();
    if (
      part?.default_retail_price != null &&
      (part.default_retail_currency ?? "DKK") === "DKK"
    ) {
      unitPrice = Number(part.default_retail_price);
    }
  }

  const inserted = await consumePartOntoWO(
    supabase,
    woId,
    location.id,
    partId,
    qty,
    unitPrice,
  );
  if (!inserted.ok) return inserted;

  revalidateWOPaths(woId);
  return { ok: true };
}

/**
 * Change the quantity of a part already on a work order. Adjusts both the
 * work_order_parts row and its linked inventory movement so the ledger
 * stays consistent with what's billed.
 */
export async function updateWOPartQty(
  woId: string,
  woPartId: string,
  quantity: number,
): Promise<WOPartsResult> {
  const t = await getTranslations("errors");
  if (!woId || !woPartId) {
    return { ok: false, error: t("woMissingWoOrRowId") };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: t("positiveQty") };
  }

  const supabase = await createClient();
  const gate = await loadOpenWO(supabase, woId);
  if (!gate.ok) return gate;

  const { data: row, error: rowErr } = await supabase
    .from("work_order_parts")
    .select("id, work_order_id, inventory_movement_id")
    .eq("id", woPartId)
    .maybeSingle();
  if (rowErr || !row) {
    return {
      ok: false,
      error: t("woCouldNotLoadRow", {
        detail: rowErr?.message ?? t("notFound"),
      }),
    };
  }
  if (row.work_order_id !== woId) {
    return { ok: false, error: t("woRowNotOnWo") };
  }

  const { error: updErr } = await supabase
    .from("work_order_parts")
    .update({ quantity })
    .eq("id", woPartId);
  if (updErr) {
    return {
      ok: false,
      error: t("woCouldNotUpdateQty", { detail: updErr.message }),
    };
  }

  if (row.inventory_movement_id) {
    const { error: movErr } = await supabase
      .from("inventory_movements")
      .update({ quantity_delta: -quantity })
      .eq("id", row.inventory_movement_id);
    if (movErr) {
      return {
        ok: false,
        error: t("woQtyUpdatedMovementFailed", { detail: movErr.message }),
      };
    }
  }

  revalidateWOPaths(woId);
  return { ok: true };
}

/**
 * "I grabbed this kit" — bulk-add the WO's bike's parts that carry the
 * given kit label, with their as-built quantities. Parts already on the
 * WO are skipped (counted, not errored). The bike's parts come from
 * `bike_parts` (the as-built record); if that's empty (bike never went
 * through the build workbench), fall back to the bike's MO recipe.
 */
export async function addKitPartsToWO(
  woId: string,
  kitId: string,
): Promise<WOKitAddResult> {
  const t = await getTranslations("errors");
  if (!woId || !kitId) {
    return { ok: false, error: t("woMissingWoOrKitId") };
  }

  const supabase = await createClient();
  const gate = await loadOpenWO(supabase, woId);
  if (!gate.ok) return gate;
  if (!gate.wo.bike_id) {
    return { ok: false, error: t("woNoBikeForKit") };
  }

  // The bike's parts (part_id → quantity), as-built first, MO recipe fallback.
  const bikeQty = new Map<string, number>();
  const { data: bikeParts } = await supabase
    .from("bike_parts")
    .select("part_id, quantity")
    .eq("bike_id", gate.wo.bike_id)
    .is("removed_at", null);
  for (const r of bikeParts ?? []) {
    bikeQty.set(r.part_id, (bikeQty.get(r.part_id) ?? 0) + Number(r.quantity));
  }
  if (bikeQty.size === 0) {
    const { data: bike } = await supabase
      .from("bikes")
      .select("manufacturing_order_id")
      .eq("id", gate.wo.bike_id)
      .maybeSingle();
    if (bike?.manufacturing_order_id) {
      const { data: moParts } = await supabase
        .from("manufacturing_order_parts")
        .select("part_id, quantity_per_bike")
        .eq("manufacturing_order_id", bike.manufacturing_order_id);
      for (const r of moParts ?? []) {
        bikeQty.set(
          r.part_id,
          (bikeQty.get(r.part_id) ?? 0) + Number(r.quantity_per_bike),
        );
      }
    }
  }
  if (bikeQty.size === 0) {
    return { ok: false, error: t("woNoPartsForBike") };
  }

  // Parts carrying this kit label, intersected with the bike's parts.
  const { data: memberships, error: memErr } = await supabase
    .from("part_kits")
    .select("part_id")
    .eq("kit_id", kitId);
  if (memErr) {
    return {
      ok: false,
      error: t("woCouldNotLoadKitParts", { detail: memErr.message }),
    };
  }
  const kitPartIds = new Set((memberships ?? []).map((m) => m.part_id));
  const targets = [...bikeQty.entries()].filter(([partId]) =>
    kitPartIds.has(partId),
  );
  if (targets.length === 0) {
    return { ok: false, error: t("woNoKitLabelParts") };
  }

  // Skip parts already consumed on this WO.
  const { data: existing } = await supabase
    .from("work_order_parts")
    .select("part_id")
    .eq("work_order_id", woId);
  const alreadyOnWO = new Set((existing ?? []).map((r) => r.part_id));

  const toAdd = targets.filter(([partId]) => !alreadyOnWO.has(partId));
  const skipped = targets.length - toAdd.length;
  if (toAdd.length === 0) {
    return { ok: true, added: 0, skipped };
  }

  const location = await defaultLocation(supabase);
  if (!location.ok) return location;

  // Retail snapshot per part, one query for the batch.
  const { data: priceRows } = await supabase
    .from("parts")
    .select("id, default_retail_price, default_retail_currency")
    .in(
      "id",
      toAdd.map(([partId]) => partId),
    );
  const retailById = new Map<string, number>();
  for (const p of priceRows ?? []) {
    if (
      p.default_retail_price != null &&
      (p.default_retail_currency ?? "DKK") === "DKK"
    ) {
      retailById.set(p.id, Number(p.default_retail_price));
    }
  }

  let added = 0;
  for (const [partId, qty] of toAdd) {
    const r = await consumePartOntoWO(
      supabase,
      woId,
      location.id,
      partId,
      qty,
      retailById.get(partId) ?? null,
    );
    if (!r.ok) {
      revalidateWOPaths(woId);
      return {
        ok: false,
        error: t("woKitAddPartialFail", {
          added,
          total: toAdd.length,
          detail: r.error,
        }),
      };
    }
    added += 1;
  }

  revalidateWOPaths(woId);
  return { ok: true, added, skipped };
}

/**
 * Remove a part from a work order, reversing the inventory consumption.
 * Deletes the work_order_parts row first, then the linked inventory_movement.
 * Refuses when the WO is completed or cancelled.
 */
export async function removePartFromWO(
  woId: string,
  woPartId: string,
): Promise<WOPartsResult> {
  const t = await getTranslations("errors");
  if (!woId || !woPartId) {
    return { ok: false, error: t("woMissingWoOrRowId") };
  }

  const supabase = await createClient();
  const gate = await loadOpenWO(supabase, woId);
  if (!gate.ok) return gate;

  const { data: row, error: rowErr } = await supabase
    .from("work_order_parts")
    .select("id, work_order_id, inventory_movement_id")
    .eq("id", woPartId)
    .maybeSingle();
  if (rowErr || !row) {
    return {
      ok: false,
      error: t("woCouldNotLoadRow", {
        detail: rowErr?.message ?? t("notFound"),
      }),
    };
  }
  if (row.work_order_id !== woId) {
    return { ok: false, error: t("woRowNotOnWo") };
  }

  const { error: delErr } = await supabase
    .from("work_order_parts")
    .delete()
    .eq("id", woPartId);
  if (delErr) {
    return {
      ok: false,
      error: t("woCouldNotRemoveRow", { detail: delErr.message }),
    };
  }

  if (row.inventory_movement_id) {
    const { error: movDelErr } = await supabase
      .from("inventory_movements")
      .delete()
      .eq("id", row.inventory_movement_id);
    if (movDelErr) {
      // The wo_parts row is gone but the movement persists. The user can
      // adjust stock manually; we surface the error so they know.
      return {
        ok: false,
        error: t("woPartRemovedMovementFailed", { detail: movDelErr.message }),
      };
    }
  }

  revalidateWOPaths(woId);
  return { ok: true };
}
