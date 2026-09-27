"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { planPaintSeed, sharedLineColour } from "@/lib/services/paint-seed";
import { loadPaintSeedInputs } from "@/lib/services/paint-seed-inputs";
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
 * Fill this paint order's item lines from the attached bikes' recipes,
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
    .select("bike_id")
    .eq("service_order_id", serviceOrderId);
  if (bikesErr) {
    return {
      ok: false,
      error: t("paintCouldNotLoadBikes", { detail: bikesErr.message }),
    };
  }
  const bikeIds = (attached ?? []).map((r) => r.bike_id);
  if (bikeIds.length === 0) return { ok: false, error: t("paintSeedNoBikes") };

  // The same loader the send-to-painter page and its action use: each bike's
  // MO recipe (else its template's), each bike's own colour.
  const inputs = await loadPaintSeedInputs(supabase, bikeIds);
  if ("error" in inputs) {
    return {
      ok: false,
      error: t("paintCouldNotLoadPaintwork", { detail: inputs.error }),
    };
  }
  if (inputs.bikes.length === 0) return { ok: false, error: t("paintSeedNoBikes") };

  const plan = planPaintSeed(inputs.bikes, inputs.templateRows, inputs.recipeParts);

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

  // The header colour follows the lines: the one colour they share, or none
  // for a mixed batch (it used to keep whatever colour the order was created
  // with, so a refilled two-colour order still printed "Yellow" on top).
  await supabase
    .from("service_orders")
    .update({ color_id: sharedLineColour(plan.lines), updated_at: new Date().toISOString() })
    .eq("id", serviceOrderId);

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
