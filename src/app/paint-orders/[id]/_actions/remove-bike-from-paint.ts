"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

export type RemoveBikeFromPaintResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Remove a bike from a service order. Only allowed while the order is still
 * `planned` — once the batch is sent we treat the membership as historical
 * record. If the bike was added in error after sending, fix it by editing
 * the row directly in Supabase.
 */
export async function removeBikeFromPaintOrder(
  serviceOrderId: string,
  bikeId: string,
): Promise<RemoveBikeFromPaintResult> {
  const t = await getTranslations("errors");
  if (!serviceOrderId) return { ok: false, error: t("missingOrderId") };
  if (!bikeId) return { ok: false, error: t("missingBikeId") };

  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("service_orders")
    .select("status")
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
  if (order.status !== "planned") {
    return {
      ok: false,
      error: t("paintBikeRemovePlannedOnly", { status: order.status }),
    };
  }

  const { error: delErr } = await supabase
    .from("service_order_bikes")
    .delete()
    .eq("service_order_id", serviceOrderId)
    .eq("bike_id", bikeId);
  if (delErr) {
    return {
      ok: false,
      error: t("paintCouldNotRemoveBike", { detail: delErr.message }),
    };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  revalidatePath("/paint-orders");
  return { ok: true };
}
