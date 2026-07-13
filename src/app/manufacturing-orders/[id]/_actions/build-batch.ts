"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { loadAtSupplierBikeIds } from "@/lib/services/at-supplier";

import { confirmBikeFrame } from "../bikes/[bikeId]/build/_actions/confirm-frame";
import { markBikeBuilt } from "./mark-bike-built";

export type BatchIdentifierInput = { typeId: string; value: string };
export type BatchBuildEntry = {
  bikeId: string;
  frameNumber: string;
  identifiers: BatchIdentifierInput[];
};

export type BatchBuildResult =
  | {
      ok: true;
      built: number;
      /** Rows left for later (no frame entered, or already built). */
      skipped: number;
      /** Rows that failed, with why. */
      errors: { frame: string; error: string }[];
    }
  | { ok: false; error: string };

/**
 * Build a batch of bikes from one screen: per bike, confirm the real frame
 * number, register the captured identifiers, then run the normal build (copy
 * recipe → consume inventory → in_stock). Reuses confirmBikeFrame + markBikeBuilt
 * so every per-bike trigger fires exactly as it does in the workbench — the
 * grid just orchestrates N of them.
 *
 * Sequential, not transactional: a row that fails (duplicate frame, shortfall,
 * at the painter) is reported and the rest continue. Rows with no frame entered
 * are skipped (left to build later), so a tech can do part of the batch now.
 */
export async function bulkBuildBikesWithIds(
  moId: string,
  entries: BatchBuildEntry[],
): Promise<BatchBuildResult> {
  const t = await getTranslations("errors");
  if (!moId) return { ok: false, error: t("missingMoId") };
  if (!entries || entries.length === 0) {
    return { ok: false, error: t("moNoBikesToBuild") };
  }

  const supabase = await createClient();

  const bikeIds = entries.map((e) => e.bikeId);
  const { data: bikes, error: bikesErr } = await supabase
    .from("bikes")
    .select("id, frame_number, status, manufacturing_order_id")
    .in("id", bikeIds);
  if (bikesErr) {
    return {
      ok: false,
      error: t("moCouldNotLoadBikes", { detail: bikesErr.message }),
    };
  }
  const bikeById = new Map((bikes ?? []).map((b) => [b.id, b]));
  const atPainter = await loadAtSupplierBikeIds(supabase, bikeIds);

  let built = 0;
  let skipped = 0;
  const errors: { frame: string; error: string }[] = [];

  for (const entry of entries) {
    const bike = bikeById.get(entry.bikeId);
    const frame = (entry.frameNumber ?? "").trim();
    const label = frame || bike?.frame_number || entry.bikeId.slice(0, 8);

    if (!bike || bike.manufacturing_order_id !== moId) {
      errors.push({ frame: label, error: t("moBikeNotOnMo") });
      continue;
    }
    if (bike.status !== "planning" && bike.status !== "building") {
      // Already built (or beyond) — nothing to do.
      skipped += 1;
      continue;
    }
    if (frame === "") {
      // No frame entered → leave it for a later batch.
      skipped += 1;
      continue;
    }
    if (atPainter.has(entry.bikeId)) {
      errors.push({
        frame: label,
        error: t("moAtPainterReceiveFirst"),
      });
      continue;
    }

    const cf = await confirmBikeFrame(moId, entry.bikeId, frame);
    if (!cf.ok) {
      errors.push({ frame: label, error: cf.error });
      continue;
    }

    let idErr: string | null = null;
    for (const id of entry.identifiers ?? []) {
      const value = (id.value ?? "").trim();
      if (!value || !id.typeId) continue;
      const { error } = await supabase.from("bike_identifiers").insert({
        bike_id: entry.bikeId,
        identifier_type_id: id.typeId,
        identifier_value: value,
      });
      if (error) {
        idErr =
          error.code === "23505"
            ? t("moIdentifierDuplicate", { value })
            : t("moCouldNotRegisterIdentifier", { detail: error.message });
        break;
      }
    }
    if (idErr) {
      // Frame is confirmed; the build is held so the tech can fix the clash.
      errors.push({ frame: cf.frameNumber, error: idErr });
      continue;
    }

    const mb = await markBikeBuilt(moId, entry.bikeId);
    if (!mb.ok) {
      errors.push({ frame: cf.frameNumber, error: mb.error });
      continue;
    }
    built += 1;
  }

  revalidatePath(`/manufacturing-orders/${moId}`);
  revalidatePath(`/manufacturing-orders/${moId}/build-batch`);
  revalidatePath("/manufacturing-orders");
  revalidatePath("/bikes");
  revalidatePath("/parts");
  return { ok: true, built, skipped, errors };
}
