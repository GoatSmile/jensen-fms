"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type BikeNotesResult = { ok: true } | { ok: false; error: string };

/**
 * Save the free-text note on ONE bike from the build screen — the spare
 * chain-lock code, "left pedal is the replacement", whatever the builder needs
 * the next person to know (15 Sep: "a notes field on the assembly build screen,
 * up here", at bike level rather than per part).
 *
 * `bikes.notes` existed and showed on the bike page, but could only be written
 * when the bike was created. Any state is allowed: a note is information about
 * the bike, not a step in its build, so a built bike can still gain one.
 */
export async function updateBikeNotes(
  moId: string,
  bikeId: string,
  rawNotes: string,
): Promise<BikeNotesResult> {
  const t = await getTranslations("errors");
  if (!moId || !bikeId) return { ok: false, error: t("moMissingMoOrBikeId") };

  const supabase = await createClient();
  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id, manufacturing_order_id")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeErr || !bike) {
    return {
      ok: false,
      error: t("bikeCouldNotLoad", { detail: bikeErr?.message ?? t("notFound") }),
    };
  }
  if (bike.manufacturing_order_id !== moId) {
    return { ok: false, error: t("moBikeNotBelongMo") };
  }

  const { error } = await supabase
    .from("bikes")
    .update({ notes: nullableString(rawNotes), updated_at: new Date().toISOString() })
    .eq("id", bikeId);
  if (error) {
    return { ok: false, error: t("bikeCouldNotSaveNotes", { detail: error.message }) };
  }

  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}
