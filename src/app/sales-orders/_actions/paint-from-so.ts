"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { OPEN_SERVICE_ORDER_STATUSES } from "@/lib/services/status";
import { PAINT_SERVICE_SLUG, loadServiceTypeBySlug } from "@/lib/services/vocab";

export type PaintFromSOInput = {
  soId: string;
  bikeIds: string[];
  supplierId: string;
  colorId: string;
  plannedSendDate: string | null;
  notes: string | null;
};

// Note: on success the action redirect()s (which throws), so the `ok: true`
// variant is never actually returned to the caller — it exists only to match
// the result-union shape used by the sibling actions (createPaintOrder,
// spawnMOFromSOLine). Callers treat "returned a value" as failure.
export type PaintFromSOResult =
  | { ok: true; serviceOrderId: string }
  | { ok: false; error: string; field?: string };

/**
 * Create a paint order from a sales order, painting a chosen SUBSET of the
 * SO's frames (Tier 2 Phase C / decision D3). The order is back-linked to
 * the SO (service_orders.sales_order_id) so both detail pages cross-link.
 *
 * Bikes reach an SO through SO → manufacturing_orders → bikes (a bike isn't
 * directly on an SO). We resolve that chain and accept only bikes that
 * belong to this SO and aren't already committed to an OPEN build-blocking
 * service order — the same eligibility the add-bike picker uses.
 *
 * Two starter item lines (frame + fork, qty = frame count, in the chosen
 * colour) are seeded automatically — the painter's list prices them
 * per piece and virtually every batch paints frames and forks. They're
 * ordinary editable lines on the detail page: adjust, add mudguards/sign/
 * carrier, or remove, while the order is still planned.
 */
export async function createPaintOrderFromSO(
  input: PaintFromSOInput,
): Promise<PaintFromSOResult> {
  const { soId, bikeIds } = input;
  if (!soId) return { ok: false, error: "Missing SO id." };
  if (!bikeIds || bikeIds.length === 0) {
    return { ok: false, error: "Pick at least one frame to paint." };
  }
  if (!input.supplierId) {
    return { ok: false, error: "Pick a supplier.", field: "supplier_id" };
  }
  if (!input.colorId) {
    return { ok: false, error: "Pick a colour.", field: "color_id" };
  }

  const supabase = await createClient();

  const serviceType = await loadServiceTypeBySlug(supabase, PAINT_SERVICE_SLUG);
  if (!serviceType) {
    return { ok: false, error: "Painting service type is missing." };
  }

  // SO must exist and be in a state where painting its frames makes sense.
  const { data: so, error: soErr } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", soId)
    .maybeSingle();
  if (soErr || !so) {
    return {
      ok: false,
      error: `Could not load SO: ${soErr?.message ?? "not found"}`,
    };
  }
  if (so.status === "cancelled" || so.status === "delivered") {
    return {
      ok: false,
      error: `Cannot create a paint order from a ${so.status} sales order.`,
    };
  }

  // Resolve the SO's frames: SO → MOs → bikes. (A bike isn't directly on an
  // SO.) PostgREST can't subquery, so walk it in two hops.
  const { data: mos, error: moErr } = await supabase
    .from("manufacturing_orders")
    .select("id")
    .eq("sales_order_id", soId);
  if (moErr) {
    return { ok: false, error: `Could not load MOs: ${moErr.message}` };
  }
  const moIds = (mos ?? []).map((m) => m.id);

  let validBikeIds = new Set<string>();
  if (moIds.length > 0) {
    const { data: soBikes, error: bikesErr } = await supabase
      .from("bikes")
      .select("id")
      .in("manufacturing_order_id", moIds)
      .is("deleted_at", null);
    if (bikesErr) {
      return { ok: false, error: `Could not load bikes: ${bikesErr.message}` };
    }
    validBikeIds = new Set((soBikes ?? []).map((b) => b.id));
  }

  const requested = [...new Set(bikeIds)];
  const strayIds = requested.filter((id) => !validBikeIds.has(id));
  if (strayIds.length > 0) {
    return {
      ok: false,
      error: `${strayIds.length} selected frame${strayIds.length === 1 ? " doesn't" : "s don't"} belong to this sales order.`,
    };
  }

  // None of the chosen frames may already be in an open build-blocking order.
  const { data: openLinks, error: linkErr } = await supabase
    .from("service_order_bikes")
    .select(
      `bike_id,
       service_order:service_orders!inner(
         status,
         service_type:service_types!service_type_id(blocks_build)
       )`,
    )
    .in("bike_id", requested)
    .in("service_order.status", OPEN_SERVICE_ORDER_STATUSES);
  if (linkErr) {
    return {
      ok: false,
      error: `Could not check existing orders: ${linkErr.message}`,
    };
  }
  const blockedCount = (openLinks ?? []).filter((r) => {
    const order = Array.isArray(r.service_order)
      ? r.service_order[0]
      : r.service_order;
    const type = order
      ? Array.isArray(order.service_type)
        ? order.service_type[0]
        : order.service_type
      : null;
    return type?.blocks_build === true;
  }).length;
  if (blockedCount > 0) {
    return {
      ok: false,
      error: `${blockedCount} selected frame${blockedCount === 1 ? " is" : "s are"} already in an open paint order. Refresh and pick again.`,
    };
  }

  // Allocate the order number and create the header, linked to the SO.
  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: serviceType.document_type },
  );
  if (numErr || typeof numberData !== "string") {
    return {
      ok: false,
      error: `Could not allocate paint-order number: ${numErr?.message ?? "unknown error"}`,
    };
  }

  const { data: created, error: createErr } = await supabase
    .from("service_orders")
    .insert({
      order_number: numberData,
      service_type_id: serviceType.id,
      supplier_id: input.supplierId,
      color_id: input.colorId,
      sales_order_id: soId,
      status: "planned",
      planned_send_date: input.plannedSendDate,
      notes: input.notes,
    })
    .select("id")
    .single();
  if (createErr || !created) {
    return {
      ok: false,
      error: `Could not create paint order: ${createErr?.message ?? "unknown error"}`,
    };
  }

  // Not transactional: if an attach fails after the header inserted, the
  // order is left partially seeded. That's a VALID, recoverable state, not a
  // broken one — the ad-hoc createPaintOrder flow intentionally creates
  // empty orders (bikes + items are added on the detail page), so the user
  // can finish or cancel it from the message below. An RPC/transaction is
  // over-engineering at this scale (single-tenant, solo-dev).
  const { error: attachErr } = await supabase.from("service_order_bikes").insert(
    requested.map((bikeId) => ({
      service_order_id: created.id,
      bike_id: bikeId,
    })),
  );
  if (attachErr) {
    return {
      ok: false,
      error: `${numberData} was created, but attaching frames failed: ${attachErr.message} Add them from the paint order page.`,
    };
  }

  // Starter item lines: frame + fork × frame count, in the batch colour.
  const partTypesRes = await supabase
    .from("service_part_types")
    .select("id, slug")
    .in("slug", ["stel", "forgaffel"]);
  const starterItems = (partTypesRes.data ?? []).map((pt) => ({
    service_order_id: created.id,
    service_part_type_id: pt.id,
    quantity: requested.length,
    color_id: input.colorId,
  }));
  if (starterItems.length > 0) {
    const { error: itemsErr } = await supabase
      .from("service_order_items")
      .insert(starterItems);
    if (itemsErr) {
      return {
        ok: false,
        error: `${numberData} was created with its frames, but seeding the item lines failed: ${itemsErr.message} Add them from the paint order page.`,
      };
    }
  }

  revalidatePath("/paint-orders");
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${soId}`);
  redirect(`/paint-orders/${created.id}`);
}
