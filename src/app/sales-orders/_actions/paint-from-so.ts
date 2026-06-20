"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { OPEN_PAINT_ORDER_STATUSES } from "@/lib/paint/status";

export type PaintFromSOInput = {
  soId: string;
  bikeIds: string[];
  supplierId: string;
  colorId: string;
  paintPartId: string | null;
  unitCost: string | null;
  unitCostCurrency: string | null;
  plannedSendDate: string | null;
  notes: string | null;
};

export type PaintFromSOResult =
  | { ok: true; paintOrderId: string }
  | { ok: false; error: string; field?: string };

function parsePrice(
  raw: string | null,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (!raw || raw.trim() === "") return { ok: true, value: null };
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Cost must be a non-negative number." };
  }
  return { ok: true, value: n };
}

/**
 * Create a paint order from a sales order, painting a chosen SUBSET of the
 * SO's frames (Tier 2 Phase C / decision D3). The paint order is back-linked
 * to the SO (paint_orders.sales_order_id) so both detail pages cross-link.
 *
 * Bikes reach an SO through SO → manufacturing_orders → bikes (a bike isn't
 * directly on an SO). We resolve that chain and accept only bikes that belong
 * to this SO and aren't already committed to an OPEN paint order (planned /
 * sent_to_painter / at_painter) — the same eligibility the add-bike picker
 * uses. Mirrors createPaintOrder for the header (number via
 * next_document_number('paint_order'), status starts `planned`).
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

  const priceParsed = parsePrice(input.unitCost);
  if (!priceParsed.ok) {
    return { ok: false, error: priceParsed.error, field: "unit_cost" };
  }
  const unit_cost = priceParsed.value;
  const unit_cost_currency =
    unit_cost == null ? null : input.unitCostCurrency ?? "DKK";

  const supabase = await createClient();

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

  // None of the chosen frames may already be in an open paint order.
  const { data: openLinks, error: linkErr } = await supabase
    .from("paint_order_bikes")
    .select("bike_id, paint_order:paint_orders!inner(status)")
    .in("bike_id", requested)
    .in("paint_order.status", OPEN_PAINT_ORDER_STATUSES);
  if (linkErr) {
    return {
      ok: false,
      error: `Could not check existing paint orders: ${linkErr.message}`,
    };
  }
  if ((openLinks?.length ?? 0) > 0) {
    return {
      ok: false,
      error: `${openLinks!.length} selected frame${openLinks!.length === 1 ? " is" : "s are"} already in an open paint order. Refresh and pick again.`,
    };
  }

  // Allocate the paint-order number and create the header, linked to the SO.
  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "paint_order" },
  );
  if (numErr || typeof numberData !== "string") {
    return {
      ok: false,
      error: `Could not allocate paint-order number: ${numErr?.message ?? "unknown error"}`,
    };
  }

  const { data: po, error: poErr } = await supabase
    .from("paint_orders")
    .insert({
      paint_order_number: numberData,
      supplier_id: input.supplierId,
      color_id: input.colorId,
      paint_part_id: input.paintPartId,
      sales_order_id: soId,
      status: "planned",
      planned_send_date: input.plannedSendDate,
      unit_cost,
      unit_cost_currency,
      notes: input.notes,
    })
    .select("id")
    .single();
  if (poErr || !po) {
    return {
      ok: false,
      error: `Could not create paint order: ${poErr?.message ?? "unknown error"}`,
    };
  }

  const { error: attachErr } = await supabase
    .from("paint_order_bikes")
    .insert(requested.map((bikeId) => ({ paint_order_id: po.id, bike_id: bikeId })));
  if (attachErr) {
    return {
      ok: false,
      error: `${numberData} was created, but attaching frames failed: ${attachErr.message} Add them from the paint order page.`,
    };
  }

  revalidatePath("/paint-orders");
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${soId}`);
  redirect(`/paint-orders/${po.id}`);
}
