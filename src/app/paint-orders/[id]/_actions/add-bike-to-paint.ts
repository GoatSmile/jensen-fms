"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type AddBikesToPaintResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; error: string };

/**
 * Attach one or more bikes to a service order. The bike link drives the
 * at-supplier build gate + traceability; WHAT gets done and the pricing live
 * on the order's item lines (per-bike colour/scope columns are legacy history
 * from the pre-items paint model). Only valid while the order is non-terminal
 * — adding bikes to a `received_back` or `cancelled` order makes no sense.
 *
 * Takes a LIST because the picker groups bikes by customer order and a
 * customer's frames go to the painter together (2026-09-02). Bikes already on
 * this order are skipped rather than failing the whole batch; the
 * (service_order_id, bike_id) primary key still catches a race.
 */
export async function addBikesToPaintOrder(
  serviceOrderId: string,
  bikeIds: string[],
  opts: { notes?: string | null } = {},
): Promise<AddBikesToPaintResult> {
  const t = await getTranslations("errors");
  if (!serviceOrderId) return { ok: false, error: t("missingOrderId") };
  const requested = [...new Set((bikeIds ?? []).filter(Boolean))];
  if (requested.length === 0) return { ok: false, error: t("paintPickBike") };

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
  if (order.status === "received_back" || order.status === "cancelled") {
    return {
      ok: false,
      error: t("paintCannotAddBikes", { status: order.status }),
    };
  }

  const { data: existing, error: existingErr } = await supabase
    .from("service_order_bikes")
    .select("bike_id")
    .eq("service_order_id", serviceOrderId)
    .in("bike_id", requested);
  if (existingErr) {
    return {
      ok: false,
      error: t("paintCouldNotAddBike", { detail: existingErr.message }),
    };
  }
  const already = new Set((existing ?? []).map((r) => r.bike_id));
  const toAdd = requested.filter((id) => !already.has(id));
  if (toAdd.length === 0) return { ok: false, error: t("paintBikeAlreadyOn") };

  const notes = nullable(opts.notes ?? null);
  const { error: insErr } = await supabase.from("service_order_bikes").insert(
    toAdd.map((bikeId) => ({
      service_order_id: serviceOrderId,
      bike_id: bikeId,
      notes,
    })),
  );
  if (insErr) {
    if (insErr.code === "23505") {
      return { ok: false, error: t("paintBikeAlreadyOn") };
    }
    return {
      ok: false,
      error: t("paintCouldNotAddBike", { detail: insErr.message }),
    };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  revalidatePath("/paint-orders");
  return { ok: true, added: toAdd.length, skipped: already.size };
}
