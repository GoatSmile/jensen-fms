"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import { OPEN_SERVICE_ORDER_STATUSES } from "@/lib/services/status";
import { PAINT_SERVICE_SLUG, loadServiceTypeBySlug } from "@/lib/services/vocab";
import {
  fallbackStarterLines,
  paintLineKey,
  planPaintSeed,
  sharedLineColour,
  type SeedLine,
} from "@/lib/services/paint-seed";
import { loadPaintSeedInputs } from "@/lib/services/paint-seed-inputs";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ErrorsT = Awaited<ReturnType<typeof getTranslations>>;

export type PaintFromSOInput = {
  soId: string;
  bikeIds: string[];
  supplierId: string;
  /**
   * Only for bikes that have NO colour of their own. Every other bike is
   * painted in its own colour — the one its sales-order line named.
   */
  fallbackColorId: string | null;
  plannedSendDate: string | null;
  notes: string | null;
};

export type AddSOBikesToPaintInput = {
  soId: string;
  serviceOrderId: string;
  bikeIds: string[];
  fallbackColorId: string | null;
};

// Note: on success the actions redirect() (which throws), so the `ok: true`
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
 * Item lines come from `planPaintSeed` over `loadPaintSeedInputs` — the same
 * pair the page previews with, so the preview and the created order cannot
 * disagree. **Each bike keeps its own colour** (15 Sep: a batch colour used to
 * overwrite every bike's, so a white-and-yellow order came out all yellow).
 * Bikes where nothing is marked or declared fall back to frame + fork starter
 * lines per colour, by type only. Lines stay editable while the order is
 * planned.
 */
export async function createPaintOrderFromSO(
  input: PaintFromSOInput,
): Promise<PaintFromSOResult> {
  const t = await getTranslations("errors");
  const { soId } = input;
  if (!soId) return { ok: false, error: t("missingSoId") };
  if (!input.bikeIds || input.bikeIds.length === 0) {
    return { ok: false, error: t("soPickBikeToSend") };
  }
  if (!input.supplierId) {
    return { ok: false, error: t("pickSupplier"), field: "supplier_id" };
  }

  const supabase = await createClient();

  const serviceType = await loadServiceTypeBySlug(supabase, PAINT_SERVICE_SLUG);
  if (!serviceType) {
    return { ok: false, error: t("soPaintServiceMissing") };
  }

  const eligible = await checkSOBikes(supabase, t, soId, input.bikeIds);
  if (!eligible.ok) return eligible;
  const requested = eligible.bikeIds;

  const seeded = await seedLinesFor(supabase, t, requested, input.fallbackColorId, {
    withFallback: true,
  });
  if (!seeded.ok) return seeded;

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
      // A header convenience only; a mixed batch leaves it empty.
      color_id: sharedLineColour(seeded.lines),
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

  if (seeded.lines.length > 0) {
    const { error: itemsErr } = await supabase.from("service_order_items").insert(
      seeded.lines.map((l) => ({
        service_order_id: created.id,
        service_part_type_id: l.servicePartTypeId,
        quantity: l.quantity,
        color_id: l.colorId,
        part_id: l.partId,
      })),
    );
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

/**
 * Add more of the SO's bikes to a paint order that is still PLANNED — the
 * "one paint job per sales order" path (15 Sep: a two-line SO spawned two MOs,
 * the first MO's prompt made a paint order, and the second line then had to
 * make — and email — another). Lines are MERGED into the order's existing ones
 * by part type × part × colour, so hand edits on the order survive; nothing is
 * replaced.
 */
export async function addSOBikesToPaintOrder(
  input: AddSOBikesToPaintInput,
): Promise<PaintFromSOResult> {
  const t = await getTranslations("errors");
  const { soId, serviceOrderId } = input;
  if (!soId) return { ok: false, error: t("missingSoId") };
  if (!serviceOrderId) return { ok: false, error: t("missingOrderId") };
  if (!input.bikeIds || input.bikeIds.length === 0) {
    return { ok: false, error: t("soPickBikeToSend") };
  }

  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("service_orders")
    .select("id, status, sales_order_id, order_number")
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (orderErr || !order) {
    return {
      ok: false,
      error: t("paintCouldNotLoadOrder", { detail: orderErr?.message ?? t("notFound") }),
    };
  }
  if (order.sales_order_id !== soId) {
    return { ok: false, error: t("soPaintOrderNotThisSo", { number: order.order_number }) };
  }
  // Planned only: after send the lines are frozen and priced, and a bike
  // added then would ride along unpriced.
  if (order.status !== "planned") {
    return { ok: false, error: t("paintItemsPlannedOnly", { status: order.status }) };
  }

  const eligible = await checkSOBikes(supabase, t, soId, input.bikeIds);
  if (!eligible.ok) return eligible;
  const requested = eligible.bikeIds;

  // No frame + fork fallback here: guessing lines into an order someone may
  // already have curated is worse than adding none and saying so.
  const seeded = await seedLinesFor(supabase, t, requested, input.fallbackColorId, {
    withFallback: false,
  });
  if (!seeded.ok) return seeded;

  const { error: attachErr } = await supabase.from("service_order_bikes").insert(
    requested.map((bikeId) => ({ service_order_id: serviceOrderId, bike_id: bikeId })),
  );
  if (attachErr) {
    return { ok: false, error: t("paintCouldNotAddBike", { detail: attachErr.message }) };
  }

  const { data: existing, error: itemsErr } = await supabase
    .from("service_order_items")
    .select("id, service_part_type_id, part_id, color_id, quantity")
    .eq("service_order_id", serviceOrderId);
  if (itemsErr) {
    return { ok: false, error: t("paintCouldNotLoadItems", { detail: itemsErr.message }) };
  }
  const byKey = new Map(
    (existing ?? []).map((i) => [
      paintLineKey(i.service_part_type_id, i.part_id, i.color_id),
      i,
    ]),
  );
  const inserts: SeedLine[] = [];
  for (const line of seeded.lines) {
    const match = byKey.get(paintLineKey(line.servicePartTypeId, line.partId, line.colorId));
    if (!match) {
      inserts.push(line);
      continue;
    }
    const { error } = await supabase
      .from("service_order_items")
      .update({ quantity: Number(match.quantity) + line.quantity })
      .eq("id", match.id);
    if (error) {
      return {
        ok: false,
        error: t("soPaintAddedItemsFailed", { number: order.order_number, detail: error.message }),
      };
    }
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from("service_order_items").insert(
      inserts.map((l) => ({
        service_order_id: serviceOrderId,
        service_part_type_id: l.servicePartTypeId,
        quantity: l.quantity,
        color_id: l.colorId,
        part_id: l.partId,
      })),
    );
    if (error) {
      return {
        ok: false,
        error: t("soPaintAddedItemsFailed", { number: order.order_number, detail: error.message }),
      };
    }
  }

  // Re-derive the header colour over ALL lines now on the order.
  const allColours = [
    ...(existing ?? []).map((i) => ({ colorId: i.color_id })),
    ...seeded.lines,
  ];
  await supabase
    .from("service_orders")
    .update({ color_id: sharedLineColour(allColours), updated_at: new Date().toISOString() })
    .eq("id", serviceOrderId);

  revalidatePath("/paint-orders");
  revalidatePath(`/paint-orders/${serviceOrderId}`);
  revalidatePath(`/sales-orders/${soId}`);
  redirect(`/paint-orders/${serviceOrderId}`);
}

/**
 * The bikes a paint order may take from this SO: on one of its MOs, unbuilt,
 * and not already on an OPEN build-blocking service order — the same
 * eligibility the page lists. Bikes reach an SO through SO → MOs → bikes (a
 * bike isn't directly on an SO), and PostgREST can't subquery, so it walks the
 * chain in two hops.
 */
async function checkSOBikes(
  supabase: Supabase,
  t: ErrorsT,
  soId: string,
  bikeIds: string[],
): Promise<{ ok: true; bikeIds: string[] } | { ok: false; error: string }> {
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
    return { ok: false, error: t("soCannotPaintFromStatus", { status: so.status }) };
  }

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
    return { ok: false, error: t("soBikesNotOnOrder", { count: strayIds.length }) };
  }

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
    return { ok: false, error: t("soCouldNotCheckOrders", { detail: linkErr.message }) };
  }
  const blockedCount = (openLinks ?? []).filter(
    (r) => one(one(r.service_order)?.service_type)?.blocks_build === true,
  ).length;
  if (blockedCount > 0) {
    return { ok: false, error: t("soBikesInOpenPaint", { count: blockedCount }) };
  }
  return { ok: true, bikeIds: requested };
}

/**
 * The lines for these bikes, each in its own colour, colourless bikes in the
 * fallback. Refuses when a bike has no colour and no fallback was given — a
 * line without a colour cannot become painted stock, and silently making one
 * is how an order comes back and converts nothing.
 */
async function seedLinesFor(
  supabase: Supabase,
  t: ErrorsT,
  bikeIds: string[],
  fallbackColorId: string | null,
  opts: { withFallback: boolean },
): Promise<{ ok: true; lines: SeedLine[] } | { ok: false; error: string; field?: string }> {
  const inputs = await loadPaintSeedInputs(supabase, bikeIds);
  if ("error" in inputs) {
    return { ok: false, error: t("paintCouldNotLoadPaintwork", { detail: inputs.error }) };
  }
  if (inputs.bikes.some((b) => !b.colorId) && !fallbackColorId) {
    return { ok: false, error: t("soPickColourForBikes"), field: "color_id" };
  }
  const bikes = inputs.bikes.map((b) => ({ ...b, colorId: b.colorId ?? fallbackColorId }));
  const plan = planPaintSeed(bikes, inputs.templateRows, inputs.recipeParts);
  if (plan.lines.length > 0 || !opts.withFallback) return { ok: true, lines: plan.lines };

  const { data: partTypes } = await supabase
    .from("service_part_types")
    .select("id, slug")
    .in("slug", ["stel", "forgaffel"]);
  return { ok: true, lines: fallbackStarterLines(bikes, (partTypes ?? []).map((p) => p.id)) };
}
