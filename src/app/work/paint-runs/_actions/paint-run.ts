"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { setServiceOrderSchedule } from "@/app/paint-orders/[id]/_actions/set-schedule";
import { transitionServiceOrderStatus } from "@/app/paint-orders/[id]/_actions/transition-status";
import { readHasCapability } from "@/lib/auth/read-session";
import { paintReceivedIncompleteEmail } from "@/lib/people/email-content";
import { notifyEvent } from "@/lib/people/notify";
import { appOrigin } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";

export type PaintRunResult = { ok: true } | { ok: false; error: string };

/**
 * The floor's paint runs (*Lakture*): Finn drives the boxes to the painter
 * and collects them (owner, 2026-09-28). The Workshop role has no `paint` —
 * the paint-order pages show prices — so these are the few moves the drive
 * needs, each checking `work` and going through the same transitions the
 * office uses.
 */
async function refuseWithoutWork(): Promise<PaintRunResult | null> {
  if (await readHasCapability("work")) return null;
  const t = await getTranslations("errors");
  return { ok: false, error: t("paintRunNeedsWork") };
}

function revalidate(orderId: string) {
  revalidatePath("/work/paint-runs");
  revalidatePath("/work");
  revalidatePath(`/paint-orders/${orderId}`);
  revalidatePath("/paint-orders");
}

/** Dropped off now — earlier than, or on, the planned date. */
export async function markPaintDroppedOff(orderId: string): Promise<PaintRunResult> {
  const refused = await refuseWithoutWork();
  if (refused) return refused;
  const r = await transitionServiceOrderStatus(orderId, "at_supplier", null);
  if (!r.ok) return { ok: false, error: r.error };
  revalidate(orderId);
  return { ok: true };
}

/** The drive slipped: move the drop-off date (the daily job reads it). */
export async function movePaintDropOff(
  orderId: string,
  date: string,
): Promise<PaintRunResult> {
  const refused = await refuseWithoutWork();
  if (refused) return refused;
  const r = await setServiceOrderSchedule(orderId, { dropOff: date || null });
  if (!r.ok) return r;
  revalidate(orderId);
  return { ok: true };
}

/** The painter says it is done; optionally the day Finn will collect. */
export async function markPaintReady(
  orderId: string,
  pickupDate: string | null,
): Promise<PaintRunResult> {
  const refused = await refuseWithoutWork();
  if (refused) return refused;
  const r = await transitionServiceOrderStatus(orderId, "ready", null);
  if (!r.ok) return { ok: false, error: r.error };
  if (pickupDate) {
    const s = await setServiceOrderSchedule(orderId, { pickup: pickupDate });
    if (!s.ok) return s;
  }
  revalidate(orderId);
  return { ok: true };
}

export async function setPaintPickup(
  orderId: string,
  date: string,
): Promise<PaintRunResult> {
  const refused = await refuseWithoutWork();
  if (refused) return refused;
  const r = await setServiceOrderSchedule(orderId, { pickup: date || null });
  if (!r.ok) return r;
  revalidate(orderId);
  return { ok: true };
}

/**
 * Collected: the boxes are back, so the order is RECEIVED BACK and its lines
 * become painted stock. Lines that name no part or colour cannot convert;
 * Finn cannot fix lines, so the goods are received anyway — they physically
 * are — and Dennis is told which order needs its lines sorted (owner,
 * 2026-09-28). The office screen still asks first.
 */
export async function markPaintPickedUp(orderId: string): Promise<PaintRunResult> {
  const refused = await refuseWithoutWork();
  if (refused) return refused;
  const r = await transitionServiceOrderStatus(orderId, "received_back", null, {
    acceptUnconvertible: true,
  });
  if (!r.ok) return { ok: false, error: r.error };

  const skipped = r.conversion?.skippedNoPart ?? 0;
  const failed = r.conversion?.failures.length ?? 0;
  if (skipped > 0 || failed > 0) {
    const supabase = await createClient();
    const { data: order } = await supabase
      .from("service_orders")
      .select("order_number")
      .eq("id", orderId)
      .maybeSingle();
    await notifyEvent(supabase, {
      eventKey: "paint.received_incomplete",
      entityId: orderId,
      buildContent: (lang) =>
        paintReceivedIncompleteEmail(lang, {
          orderNumber: order?.order_number ?? orderId,
          skipped,
          failed,
          url: `${appOrigin()}/paint-orders/${orderId}`,
        }),
    });
  }
  revalidate(orderId);
  revalidatePath("/parts/painted");
  return { ok: true };
}
