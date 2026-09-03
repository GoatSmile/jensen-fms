"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import { OPEN_SERVICE_ORDER_STATUSES } from "@/lib/services/status";
import { PAINT_SERVICE_SLUG, loadServiceTypeBySlug } from "@/lib/services/vocab";
import {
  planPaintSeed,
  type SeedBike,
  type SeedRecipePart,
} from "@/lib/services/paint-seed";

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
 * SO's bikes (Tier 2 Phase C / decision D3). The order is back-linked to
 * the SO (service_orders.sales_order_id) so both detail pages cross-link.
 *
 * Bikes reach an SO through SO → manufacturing_orders → bikes (a bike isn't
 * directly on an SO). We resolve that chain and accept only bikes that
 * belong to this SO and aren't already committed to an OPEN build-blocking
 * service order — the same eligibility the add-bike picker uses.
 *
 * Item lines are seeded from the chosen bikes' templates the same way
 * "Re-fill from bikes" does (paint-seed.ts): the template's paintwork rows, in
 * the chosen colour, each naming the specific recipe part paintable as that
 * type — so the order converts raw into painted stock when it comes back
 * (docs/plan-painted-parts.md). Bikes whose template declares no paintwork fall
 * back to two starter lines (frame + fork, by type only). Lines stay ordinary
 * editable lines while the order is planned.
 */
export async function createPaintOrderFromSO(
  input: PaintFromSOInput,
): Promise<PaintFromSOResult> {
  const t = await getTranslations("errors");
  const { soId, bikeIds } = input;
  if (!soId) return { ok: false, error: t("missingSoId") };
  if (!bikeIds || bikeIds.length === 0) {
    return { ok: false, error: t("soPickBikeToSend") };
  }
  if (!input.supplierId) {
    return { ok: false, error: t("pickSupplier"), field: "supplier_id" };
  }
  if (!input.colorId) {
    return { ok: false, error: t("soPickColour"), field: "color_id" };
  }

  const supabase = await createClient();

  const serviceType = await loadServiceTypeBySlug(supabase, PAINT_SERVICE_SLUG);
  if (!serviceType) {
    return { ok: false, error: t("soPaintServiceMissing") };
  }

  // SO must exist and be in a state where painting its bikes makes sense.
  const { data: so, error: soErr } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", soId)
    .maybeSingle();
  if (soErr || !so) {
    return {
      ok: false,
      error: t("soCouldNotLoad", { detail: soErr?.message ?? t("notFound") }),
    };
  }
  if (so.status === "cancelled" || so.status === "delivered") {
    return {
      ok: false,
      error: t("soCannotPaintFromStatus", { status: so.status }),
    };
  }

  // Resolve the SO's bikes: SO → MOs → bikes. (A bike isn't directly on an
  // SO.) PostgREST can't subquery, so walk it in two hops.
  const { data: mos, error: moErr } = await supabase
    .from("manufacturing_orders")
    .select("id")
    .eq("sales_order_id", soId);
  if (moErr) {
    return { ok: false, error: t("soCouldNotLoadMos", { detail: moErr.message }) };
  }
  const moIds = (mos ?? []).map((m) => m.id);

  let validBikeIds = new Set<string>();
  if (moIds.length > 0) {
    const { data: soBikes, error: bikesErr } = await supabase
      .from("bikes")
      .select("id")
      .in("manufacturing_order_id", moIds)
      // A built bike has nothing left to paint; only unbuilt bikes go.
      .in("status", ["planning", "building"])
      .is("deleted_at", null);
    if (bikesErr) {
      return { ok: false, error: t("soCouldNotLoadBikes", { detail: bikesErr.message }) };
    }
    validBikeIds = new Set((soBikes ?? []).map((b) => b.id));
  }

  const requested = [...new Set(bikeIds)];
  const strayIds = requested.filter((id) => !validBikeIds.has(id));
  if (strayIds.length > 0) {
    return {
      ok: false,
      error: t("soBikesNotOnOrder", { count: strayIds.length }),
    };
  }

  // None of the chosen bikes may already be in an open build-blocking order.
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
      error: t("soCouldNotCheckOrders", { detail: linkErr.message }),
    };
  }
  const blockedCount = (openLinks ?? []).filter(
    (r) => one(one(r.service_order)?.service_type)?.blocks_build === true,
  ).length;
  if (blockedCount > 0) {
    return {
      ok: false,
      error: t("soBikesInOpenPaint", { count: blockedCount }),
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
      error: t("soCouldNotAllocatePaintNumber", {
        detail: numErr?.message ?? t("unknownError"),
      }),
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
      error: t("soCouldNotCreatePaint", {
        detail: createErr?.message ?? t("unknownError"),
      }),
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
      error: t("soPaintCreatedAttachFailed", {
        number: numberData,
        detail: attachErr.message,
      }),
    };
  }

  // Item lines from the bikes' templates, naming the specific parts (phase 4).
  // The batch colour overrides each bike's own colour: this order paints in ONE
  // colour by construction, and the form said which.
  const { data: seedBikeRows } = await supabase
    .from("bikes")
    .select("id, template_id")
    .in("id", requested);
  const seedBikes: SeedBike[] = (seedBikeRows ?? []).map((b) => ({
    id: b.id,
    templateId: b.template_id,
    colorId: input.colorId,
  }));
  const templateIds = [...new Set(seedBikes.map((b) => b.templateId).filter((x): x is string => !!x))];
  const [{ data: paintwork }, { data: recipeRows }] = templateIds.length
    ? await Promise.all([
        supabase
          .from("bike_template_service_parts")
          .select("template_id, service_part_type_id, quantity")
          .in("template_id", templateIds),
        supabase
          .from("bike_template_parts")
          .select("template_id, part_id, quantity, part:parts!part_id(service_part_type_id, deleted_at)")
          .in("template_id", templateIds),
      ])
    : [{ data: [] }, { data: [] }];
  const recipeParts: SeedRecipePart[] = [];
  for (const r of recipeRows ?? []) {
    const part = one(r.part);
    if (!part || part.deleted_at || !part.service_part_type_id) continue;
    recipeParts.push({
      templateId: r.template_id,
      partId: r.part_id,
      servicePartTypeId: part.service_part_type_id,
      quantityPerBike: Number(r.quantity),
    });
  }
  const plan = planPaintSeed(
    seedBikes,
    (paintwork ?? []).map((r) => ({
      templateId: r.template_id,
      servicePartTypeId: r.service_part_type_id,
      quantity: r.quantity,
    })),
    recipeParts,
  );
  let starterItems = plan.lines.map((l) => ({
    service_order_id: created.id,
    service_part_type_id: l.servicePartTypeId,
    quantity: l.quantity,
    color_id: l.colorId,
    part_id: l.partId,
  }));
  if (starterItems.length === 0) {
    // No paintwork declared on these templates: the old frame + fork starters.
    const partTypesRes = await supabase
      .from("service_part_types")
      .select("id, slug")
      .in("slug", ["stel", "forgaffel"]);
    starterItems = (partTypesRes.data ?? []).map((pt) => ({
      service_order_id: created.id,
      service_part_type_id: pt.id,
      quantity: requested.length,
      color_id: input.colorId,
      part_id: null,
    }));
  }
  if (starterItems.length > 0) {
    const { error: itemsErr } = await supabase
      .from("service_order_items")
      .insert(starterItems);
    if (itemsErr) {
      return {
        ok: false,
        error: t("soPaintCreatedItemsFailed", {
          number: numberData,
          detail: itemsErr.message,
        }),
      };
    }
  }

  revalidatePath("/paint-orders");
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${soId}`);
  redirect(`/paint-orders/${created.id}`);
}
