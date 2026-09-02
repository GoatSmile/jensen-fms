"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  planPaintSeed,
  type SeedBike,
  type SeedRecipePart,
} from "@/lib/services/paint-seed";
import { createClient } from "@/lib/supabase/server";

export type SeedItemsResult =
  | {
      ok: true;
      linesWritten: number;
      seededBikes: number;
      bikesWithoutTemplate: number;
      bikesWithoutPaintwork: number;
      bikesWithoutColour: number;
    }
  | { ok: false; error: string };

/**
 * Fill this paint order's item lines from the attached bikes' templates,
 * REPLACING whatever is there (migration 82's RPC does both sides in one
 * transaction — a failed insert must not leave a hand-curated list wiped).
 *
 * Explicit, never automatic: attaching a bike is traceability, deciding what
 * goes to the painter is a decision, and a bike may deliberately be sent for
 * frame-only. The button is the decision.
 */
export async function seedItemsFromBikes(
  serviceOrderId: string,
): Promise<SeedItemsResult> {
  const t = await getTranslations("errors");
  if (!serviceOrderId) return { ok: false, error: t("missingOrderId") };

  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("service_orders")
    .select("id, status")
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (orderErr || !order) {
    return {
      ok: false,
      error: t("paintCouldNotLoadOrder", {
        detail: orderErr?.message ?? t("notFound"),
      }),
    };
  }
  // Same edit window as every other item write; the RPC re-checks it.
  if (order.status !== "planned") {
    return {
      ok: false,
      error: t("paintItemsPlannedOnly", { status: order.status }),
    };
  }

  const { data: attached, error: bikesErr } = await supabase
    .from("service_order_bikes")
    .select("bike:bikes(id, template_id, color_id)")
    .eq("service_order_id", serviceOrderId);
  if (bikesErr) {
    return {
      ok: false,
      error: t("paintCouldNotLoadBikes", { detail: bikesErr.message }),
    };
  }

  const bikes: SeedBike[] = (attached ?? [])
    .map((r) => (Array.isArray(r.bike) ? r.bike[0] : r.bike))
    .filter((b): b is NonNullable<typeof b> => b != null)
    .map((b) => ({
      id: b.id,
      templateId: b.template_id,
      colorId: b.color_id,
    }));
  if (bikes.length === 0) return { ok: false, error: t("paintSeedNoBikes") };

  const templateIds = [
    ...new Set(
      bikes.map((b) => b.templateId).filter((id): id is string => !!id),
    ),
  ];
  const { data: rows, error: rowsErr } = templateIds.length
    ? await supabase
        .from("bike_template_service_parts")
        .select("template_id, service_part_type_id, quantity")
        .in("template_id", templateIds)
    : { data: [], error: null };
  if (rowsErr) {
    return {
      ok: false,
      error: t("paintCouldNotLoadPaintwork", { detail: rowsErr.message }),
    };
  }

  // Phase 4 (docs/plan-painted-parts.md): the recipe parts paintable as each
  // type, so the seeded line names the specific part and can convert stock.
  const { data: recipeRows } = templateIds.length
    ? await supabase
        .from("bike_template_parts")
        .select("template_id, part_id, quantity, part:parts!part_id(service_part_type_id, deleted_at)")
        .in("template_id", templateIds)
    : { data: [] as { template_id: string; part_id: string; quantity: number; part: unknown }[] };
  const recipeParts: SeedRecipePart[] = [];
  for (const r of recipeRows ?? []) {
    const part = (Array.isArray(r.part) ? r.part[0] : r.part) as
      | { service_part_type_id: string | null; deleted_at: string | null }
      | null;
    if (!part || part.deleted_at || !part.service_part_type_id) continue;
    recipeParts.push({
      templateId: r.template_id,
      partId: r.part_id,
      servicePartTypeId: part.service_part_type_id,
      quantityPerBike: Number(r.quantity),
    });
  }

  const plan = planPaintSeed(
    bikes,
    (rows ?? []).map((r) => ({
      templateId: r.template_id,
      servicePartTypeId: r.service_part_type_id,
      quantity: r.quantity,
    })),
    recipeParts,
  );

  // Nothing to write means nothing gets destroyed either — refusing here
  // keeps "every attached bike is unseedable" from quietly emptying the order.
  if (plan.lines.length === 0) {
    return { ok: false, error: t("paintSeedNothingToSeed") };
  }

  const { data: written, error: rpcErr } = await supabase.rpc(
    "replace_service_order_items",
    {
      p_order_id: serviceOrderId,
      p_items: plan.lines.map((l) => ({
        service_part_type_id: l.servicePartTypeId,
        quantity: l.quantity,
        color_id: l.colorId,
        part_id: l.partId,
      })),
    },
  );
  if (rpcErr) {
    return {
      ok: false,
      error: t("paintCouldNotSeed", { detail: rpcErr.message }),
    };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  return {
    ok: true,
    linesWritten: written ?? plan.lines.length,
    seededBikes: plan.seededBikes,
    bikesWithoutTemplate: plan.bikesWithoutTemplate,
    bikesWithoutPaintwork: plan.bikesWithoutPaintwork,
    bikesWithoutColour: plan.bikesWithoutColour,
  };
}
