"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nextFrameNumberFromDb } from "@/lib/bikes/frame-number";
import { createClient } from "@/lib/supabase/server";

export type ConfirmFrameResult =
  | { ok: true; frameNumber: string }
  | {
      ok: false;
      error: string;
      /**
       * The frame number belongs to ANOTHER bike (migration 108). `takeable`
       * when that bike is unbuilt — its number is only a placeholder or a
       * mistake — so the caller may retry with `takeFromUnbuilt`.
       */
      conflict?: { bikeId: string; moId: string | null; takeable: boolean };
    };

/**
 * Confirm the *real* physical frame number for a bike during the build.
 *
 * MO bikes are auto-created with a provisional placeholder frame (JP-{year}-…)
 * and `frame_number_confirmed = false`. A tech enters the real frame stamped on
 * the bike here; we update the authoritative `bikes.frame_number` (UNIQUE),
 * flip `frame_number_confirmed`, and keep the bike_identifiers frame row in
 * sync so cross-bike search keeps hitting it. finishBikeBuild refuses to
 * consume inventory until this flag is true.
 *
 * Only allowed while the bike is still planning/building — a built bike's
 * frame is already locked in.
 *
 * **A frame number already on another bike** (Dennis, 15 Sep 02:04; owner
 * 2026-09-28): if that bike is UNBUILT, `takeFromUnbuilt` moves the number
 * here and gives the other bike a fresh provisional number — a placeholder
 * or a typo on a bike nobody has built is cheap to redo. If that bike is
 * built, it is refused with a link: two built records for one physical frame
 * is a merge for a human, not a move.
 */
export async function confirmBikeFrame(
  moId: string,
  bikeId: string,
  rawFrameNumber: string,
  opts: { takeFromUnbuilt?: boolean } = {},
): Promise<ConfirmFrameResult> {
  const t = await getTranslations("errors");
  if (!moId || !bikeId) {
    return { ok: false, error: t("moMissingMoOrBikeId") };
  }
  const frameNumber = (rawFrameNumber ?? "").trim();
  if (frameNumber === "") {
    return { ok: false, error: t("moEnterRealFrame") };
  }

  const supabase = await createClient();

  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id, status, manufacturing_order_id, frame_number")
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
  if (bike.status !== "planning" && bike.status !== "building") {
    return {
      ok: false,
      error: t("moFrameConfirmWhileBuilding"),
    };
  }

  const previousFrame = bike.frame_number;
  const frameChanged = previousFrame !== frameNumber;

  if (frameChanged) {
    const { data: holder } = await supabase
      .from("bikes")
      .select(
        "id, status, manufacturing_order_id, bike_type:bike_types!bike_type_id(slug)",
      )
      .eq("frame_number", frameNumber)
      .neq("id", bikeId)
      .maybeSingle();
    if (holder) {
      const takeable =
        holder.status === "planning" || holder.status === "building";
      if (!takeable || !opts.takeFromUnbuilt) {
        return {
          ok: false,
          error: takeable
            ? t("moFrameOnUnbuiltBike")
            : t("moFrameOnBuiltBike"),
          conflict: {
            bikeId: holder.id,
            moId: holder.manufacturing_order_id,
            takeable,
          },
        };
      }
      const released = await releaseFrameToProvisional(
        supabase,
        holder.id,
        (Array.isArray(holder.bike_type) ? holder.bike_type[0] : holder.bike_type)
          ?.slug ?? null,
      );
      if (!released.ok) {
        return {
          ok: false,
          error: t("moCouldNotConfirmFrame", { detail: released.error }),
        };
      }
      if (holder.manufacturing_order_id) {
        revalidatePath(`/manufacturing-orders/${holder.manufacturing_order_id}`);
      }
      revalidatePath(`/bikes/${holder.id}`);
    }
  }

  const { error: updErr } = await supabase
    .from("bikes")
    .update({
      frame_number: frameNumber,
      frame_number_confirmed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bikeId);
  if (updErr) {
    if (updErr.code === "23505") {
      return {
        ok: false,
        error: t("bikeFrameNumberDuplicate"),
      };
    }
    return {
      ok: false,
      error: t("moCouldNotConfirmFrame", { detail: updErr.message }),
    };
  }

  // Keep the bike_identifiers frame row in sync. bikes.frame_number is
  // authoritative, but the confirmed flag is the ONLY thing finishBikeBuild
  // gates on — so a silent sync failure would let inventory be consumed for a
  // bike whose frame identifier is stale/missing. If the sync fails we roll the
  // bikes update back to provisional so the flag and the identifier never drift.
  if (frameChanged) {
    const { data: idType } = await supabase
      .from("bike_identifier_types")
      .select("id")
      .eq("slug", "frame_number")
      .maybeSingle();
    if (idType) {
      const { data: existing } = await supabase
        .from("bike_identifiers")
        .select("id")
        .eq("bike_id", bikeId)
        .eq("identifier_type_id", idType.id)
        .eq("is_active", true)
        .maybeSingle();
      const { error: syncErr } = existing
        ? await supabase
            .from("bike_identifiers")
            .update({ identifier_value: frameNumber })
            .eq("id", existing.id)
        : await supabase.from("bike_identifiers").insert({
            bike_id: bikeId,
            identifier_type_id: idType.id,
            identifier_value: frameNumber,
          });
      if (syncErr) {
        // Roll back so we never leave frame_number_confirmed = true with a
        // stale identifier (the build gate would otherwise pass).
        await supabase
          .from("bikes")
          .update({
            frame_number: previousFrame,
            frame_number_confirmed: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", bikeId);
        return {
          ok: false,
          error:
            syncErr.code === "23505"
              ? t("moFrameIdentifierDuplicate")
              : t("moCouldNotSyncFrameIdentifier", { detail: syncErr.message }),
        };
      }
    }
  }

  revalidatePath(`/manufacturing-orders/${moId}/bikes/${bikeId}/build`);
  revalidatePath(`/manufacturing-orders/${moId}`);
  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath("/bikes");
  return { ok: true, frameNumber };
}

/**
 * Give an UNBUILT bike a fresh generated frame number, unconfirmed, and keep
 * its frame identifier row in step — so the number it held is free for the
 * bike the tech is actually standing at.
 */
async function releaseFrameToProvisional(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bikeId: string,
  typeSlug: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fresh = await nextFrameNumberFromDb(supabase, {
    year: new Date().getFullYear(),
    code: typeSlug,
  });
  const { error } = await supabase
    .from("bikes")
    .update({
      frame_number: fresh,
      frame_number_confirmed: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bikeId);
  if (error) return { ok: false, error: error.message };
  const { data: idType } = await supabase
    .from("bike_identifier_types")
    .select("id")
    .eq("slug", "frame_number")
    .maybeSingle();
  if (idType) {
    await supabase
      .from("bike_identifiers")
      .update({ identifier_value: fresh })
      .eq("bike_id", bikeId)
      .eq("identifier_type_id", idType.id)
      .eq("is_active", true);
  }
  return { ok: true };
}
