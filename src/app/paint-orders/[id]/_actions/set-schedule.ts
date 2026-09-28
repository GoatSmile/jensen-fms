"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

export type SetScheduleResult = { ok: true } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The two dates a paint order is driven by (migration 106):
 *
 *  - **Drop-off** (`planned_send_date`) — when Finn takes the boxes to the
 *    painter. A daily job moves a `confirmed` order to `at_supplier` on this
 *    date, so moving it is how a slipped drive is recorded. Editable until the
 *    goods have left.
 *  - **Pickup** (`pickup_date`) — the day Finn plans to collect. Shown on the
 *    order to everyone once the painter has it. Editable until received back.
 *
 * `null` clears a date. A key that is not passed is left alone.
 */
export async function setServiceOrderSchedule(
  serviceOrderId: string,
  dates: { dropOff?: string | null; pickup?: string | null },
): Promise<SetScheduleResult> {
  const t = await getTranslations("errors");
  if (!serviceOrderId) return { ok: false, error: t("missingId") };
  for (const v of [dates.dropOff, dates.pickup]) {
    if (v != null && !ISO_DATE.test(v)) {
      return { ok: false, error: t("invalidDate") };
    }
  }

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("service_orders")
    .select("id, status")
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (error || !order) {
    return {
      ok: false,
      error: t("paintCouldNotLoadOrder", { detail: error?.message ?? t("notFound") }),
    };
  }

  const patch: { planned_send_date?: string | null; pickup_date?: string | null } =
    {};
  if (dates.dropOff !== undefined) {
    if (order.status !== "planned" && order.status !== "confirmed") {
      return { ok: false, error: t("paintDropOffLocked") };
    }
    patch.planned_send_date = dates.dropOff;
  }
  if (dates.pickup !== undefined) {
    if (order.status === "received_back" || order.status === "cancelled") {
      return { ok: false, error: t("paintPickupLocked") };
    }
    patch.pickup_date = dates.pickup;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error: updErr } = await supabase
    .from("service_orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", serviceOrderId);
  if (updErr) {
    return {
      ok: false,
      error: t("paintCouldNotUpdateStatus", { detail: updErr.message }),
    };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  revalidatePath("/paint-orders");
  return { ok: true };
}
