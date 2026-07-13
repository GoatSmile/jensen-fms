"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

export type SaveProductionNoteResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Set the build-floor production / labeling note on a sales order (Tier 2
 * Phase D). Editable mid-production — labeling instructions often arrive after
 * the SO is confirmed — so unlike the draft-only header form this only blocks
 * the terminal states (cancelled / delivered). Empty input clears the note.
 *
 * Revalidates the SO detail, the /work floor, and the per-bike build workbench
 * route so the note propagates to every surface. The build pages render
 * dynamically (cookies) but the client Router Cache can still serve a
 * previously-visited workbench stale on back-navigation, so we invalidate that
 * route too (dynamic-segment revalidate covers every bike's workbench).
 */
export async function saveProductionNote(
  soId: string,
  note: string,
): Promise<SaveProductionNoteResult> {
  const t = await getTranslations("errors");
  if (!soId) return { ok: false, error: t("missingSoId") };

  const supabase = await createClient();

  const { data: so, error: lookupErr } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", soId)
    .maybeSingle();
  if (lookupErr || !so) {
    return {
      ok: false,
      error: t("soCouldNotLoad", { detail: lookupErr?.message ?? t("notFound") }),
    };
  }
  if (so.status === "cancelled" || so.status === "delivered") {
    return {
      ok: false,
      error: t("soCannotEditNoteStatus", { status: so.status }),
    };
  }

  const trimmed = note.trim();
  const { error } = await supabase
    .from("sales_orders")
    .update({
      production_note: trimmed === "" ? null : trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", soId);
  if (error) {
    return { ok: false, error: t("soCouldNotSaveNote", { detail: error.message }) };
  }

  revalidatePath(`/sales-orders/${soId}`);
  revalidatePath("/work");
  revalidatePath("/manufacturing-orders/[id]/bikes/[bikeId]/build", "page");
  return { ok: true };
}
