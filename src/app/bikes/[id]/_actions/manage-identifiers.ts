"use server";

import { revalidatePath } from "next/cache";
import { getTranslations, getLocale } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { localizedName } from "@/i18n/vocab";

export type IdentifierConflict = {
  bikeId: string;
  frameNumber: string;
  /** Battery / charger numbers can be MOVED here; a frame number cannot. */
  movable: boolean;
};

export type IdentifierResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      field?: string;
      /** The number is active on ANOTHER bike (migration 108). */
      conflict?: IdentifierConflict;
    };

/**
 * Register a new identifier on a bike. Frame, battery and charger numbers are
 * unique among ACTIVE identifiers; lock numbers never are (migration 108).
 *
 * **"Already exists — move it here?"** (Dennis, 15 Sep 02:04). When the number
 * is active on another bike, the first call returns the `conflict` instead of
 * a bare error; the caller asks, and calls again with `overwrite` = "1", which
 * deactivates the other bike's identifier (noting where it went) and registers
 * it here — a swapped battery is the everyday case. A FRAME number is never
 * moved from here: two bike records for one frame is a merge, not a move (the
 * build screen handles an unbuilt bike's provisional frame).
 *
 * `format_regex` on the identifier_type, when set, is checked client-side
 * AND server-side (regex re-eval here) so manipulated form posts can't
 * smuggle invalid values past UI validation.
 */
export async function createBikeIdentifier(
  bikeId: string,
  formData: FormData,
  extraRevalidatePaths?: string[],
): Promise<IdentifierResult> {
  const t = await getTranslations("errors");
  if (!bikeId) return { ok: false, error: t("missingBikeId") };
  const identifier_type_id = nullable(formData.get("identifier_type_id"));
  const identifier_value = nullable(formData.get("identifier_value"));
  const notes = nullable(formData.get("notes"));
  const overwrite = formData.get("overwrite") === "1";

  if (!identifier_type_id) {
    return { ok: false, error: t("bikePickIdentifierType"), field: "identifier_type_id" };
  }
  if (!identifier_value) {
    return { ok: false, error: t("bikeIdentifierValueRequired"), field: "identifier_value" };
  }

  const supabase = await createClient();

  // Server-side regex validation so the action stands on its own without UI cooperation.
  const { data: typeRow } = await supabase
    .from("bike_identifier_types")
    .select("name_en, name_da, format_regex, slug, is_globally_unique")
    .eq("id", identifier_type_id)
    .maybeSingle();
  if (typeRow?.format_regex) {
    try {
      const re = new RegExp(typeRow.format_regex);
      if (!re.test(identifier_value)) {
        const locale = await getLocale();
        return {
          ok: false,
          error: t("bikeIdentifierFormatMismatch", {
            name: localizedName(locale, typeRow.name_en, typeRow.name_da),
            format: typeRow.format_regex,
          }),
          field: "identifier_value",
        };
      }
    } catch {
      // Stored regex is invalid — fall through. Surfacing this as a soft warning
      // is better than blocking on a config-level bug.
    }
  }

  let movedFromBikeId: string | null = null;
  if (typeRow?.is_globally_unique) {
    const { data: holder } = await supabase
      .from("bike_identifiers")
      .select("id, bike_id, notes, bike:bikes!bike_id(frame_number)")
      .eq("identifier_type_id", identifier_type_id)
      .eq("identifier_value", identifier_value)
      .eq("is_active", true)
      .maybeSingle();
    if (holder && holder.bike_id === bikeId) {
      return {
        ok: false,
        error: t("bikeIdentifierDuplicate"),
        field: "identifier_value",
      };
    }
    if (holder) {
      const bike = Array.isArray(holder.bike) ? holder.bike[0] : holder.bike;
      const frameNumber = bike?.frame_number ?? "—";
      const movable = typeRow.slug !== "frame_number";
      if (!overwrite || !movable) {
        return {
          ok: false,
          error: movable
            ? t("bikeIdentifierOnOtherBike", { frame: frameNumber })
            : t("bikeFrameOnOtherBike", { frame: frameNumber }),
          field: "identifier_value",
          conflict: { bikeId: holder.bike_id, frameNumber, movable },
        };
      }
      const { data: here } = await supabase
        .from("bikes")
        .select("frame_number")
        .eq("id", bikeId)
        .maybeSingle();
      const stamp = `[${new Date().toISOString().slice(0, 10)}] Moved to ${here?.frame_number ?? bikeId}`;
      const { error: moveErr } = await supabase
        .from("bike_identifiers")
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          notes: holder.notes ? `${holder.notes}\n${stamp}` : stamp,
        })
        .eq("id", holder.id);
      if (moveErr) {
        return { ok: false, error: t("bikeCouldNotRegister", { detail: moveErr.message }) };
      }
      movedFromBikeId = holder.bike_id;
    }
  }

  const { error } = await supabase.from("bike_identifiers").insert({
    bike_id: bikeId,
    identifier_type_id,
    identifier_value,
    notes,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: t("bikeIdentifierDuplicate"),
        field: "identifier_value",
      };
    }
    return { ok: false, error: t("bikeCouldNotRegister", { detail: error.message }) };
  }

  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath("/bikes");
  if (movedFromBikeId) revalidatePath(`/bikes/${movedFromBikeId}`);
  // Callers that render this bike's identifiers on another route (e.g. the
  // build workbench) pass their own path so it refreshes too.
  for (const p of extraRevalidatePaths ?? []) revalidatePath(p);
  return { ok: true };
}

/**
 * Mark an identifier as inactive (e.g., the original was damaged and replaced).
 * The row stays in the database for history; a fresh identifier of the same
 * type is registered separately.
 */
export async function deactivateBikeIdentifier(
  bikeId: string,
  identifierId: string,
): Promise<IdentifierResult> {
  const t = await getTranslations("errors");
  if (!bikeId || !identifierId) {
    return { ok: false, error: t("bikeMissingBikeOrIdentifierId") };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("bike_identifiers")
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
    })
    .eq("id", identifierId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}
