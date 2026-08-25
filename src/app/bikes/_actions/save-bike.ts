"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { readPersonId } from "@/lib/auth/read-session";
import { createClient } from "@/lib/supabase/server";
import { isRecordableStatus, type RecordableStatus } from "@/lib/bikes/status";

export type SaveBikeResult =
  { ok: true; bikeId: string } | { ok: false; error: string; field?: string };

type ParsedFields = {
  bike_type_id: string;
  template_id: string | null;
  color_id: string | null;
  frame_number: string;
  notes: string | null;
  status: RecordableStatus;
  owner_organization_id: string | null;
};

function parseFields(
  formData: FormData,
): ParsedFields | { errorKey: string; field?: string } {
  const bike_type_id = nullable(formData.get("bike_type_id"));
  const frame_number = nullable(formData.get("frame_number"));
  if (!bike_type_id)
    return { errorKey: "bikeTypeRequired", field: "bike_type_id" };
  if (!frame_number)
    return { errorKey: "bikeFrameNumberRequired", field: "frame_number" };

  // Whitelist, not a cast: this endpoint must never be able to mint a
  // `planning` or `building` bike, whatever the client posts.
  const statusRaw = nullable(formData.get("status")) ?? "";
  if (!isRecordableStatus(statusRaw))
    return { errorKey: "bikeRecordStatusInvalid", field: "status" };

  // An in-service bike is someone's bike — without an owner it is a fleet row
  // nobody can be billed or contacted for. in_stock is ours, so no owner.
  const owner = nullable(formData.get("owner_organization_id"));
  if (statusRaw === "in_service" && !owner)
    return {
      errorKey: "bikeOwnerRequiredInService",
      field: "owner_organization_id",
    };

  return {
    bike_type_id,
    template_id: nullable(formData.get("template_id")),
    color_id: nullable(formData.get("color_id")),
    frame_number,
    notes: nullable(formData.get("notes")),
    status: statusRaw,
    owner_organization_id: statusRaw === "in_service" ? owner : null,
  };
}

function explainBikeError(err: {
  code?: string;
  message: string;
}):
  | { duplicateFrame: true; field: string }
  | { duplicateFrame: false; message: string } {
  if (err.code === "23505" && /frame_number/.test(err.message)) {
    return { duplicateFrame: true, field: "frame_number" };
  }
  return { duplicateFrame: false, message: err.message };
}

/**
 * Records a bike that ALREADY EXISTS physically and that we are not building:
 * a customer's bike arriving for service, or pre-system stock. Anything we
 * build — to order or to stock — goes through a manufacturing order instead,
 * which creates its own bikes at `planning`.
 *
 * So this path can only produce `in_service` (owner required) or `in_stock`
 * (no owner) — see `RECORDABLE_STATUSES`. It used to hardcode `planning`,
 * which let two clicks strand a bike in `building` with no way out.
 *
 * The lifecycle identifiers beyond the frame number (lock, battery, QR…) are
 * registered as separate actions after creation.
 */
export async function createBike(formData: FormData): Promise<SaveBikeResult> {
  const t = await getTranslations("errors");
  const parsed = parseFields(formData);
  if ("errorKey" in parsed)
    return { ok: false, error: t(parsed.errorKey), field: parsed.field };

  const supabase = await createClient();

  // Insert the bike row.
  const { data: bike, error } = await supabase
    .from("bikes")
    .insert({
      bike_type_id: parsed.bike_type_id,
      template_id: parsed.template_id,
      color_id: parsed.color_id,
      frame_number: parsed.frame_number,
      status: parsed.status,
      // /bikes/new records a bike that already exists; the first state-log
      // row still names who recorded it (migration 84).
      last_actor_id: await readPersonId(),
      notes: parsed.notes,
      owner_organization_id: parsed.owner_organization_id,
      // A recorded in-service bike is already with its customer, so stamp the
      // handover timestamp now — the same field `in_stock → assigned` sets.
      ...(parsed.status === "in_service"
        ? { assigned_at: new Date().toISOString() }
        : {}),
      // frame_number_confirmed stays false: this is a real frame number the
      // user read off the bike, but confirming is the build workbench's step
      // and a recorded bike never passes through it. Nothing downstream gates
      // on it outside finishBikeBuild.
    })
    .select("id")
    .single();

  if (error || !bike) {
    const e = explainBikeError(error ?? { message: t("unknownError") });
    if (e.duplicateFrame)
      return {
        ok: false,
        error: t("bikeFrameNumberDuplicate"),
        field: e.field,
      };
    return { ok: false, error: e.message };
  }

  // Also register the frame number as a bike_identifier so search/lookup
  // works. We need the frame-number identifier_type_id by slug.
  const { data: idType } = await supabase
    .from("bike_identifier_types")
    .select("id")
    .eq("slug", "frame_number")
    .maybeSingle();
  if (idType) {
    await supabase.from("bike_identifiers").insert({
      bike_id: bike.id,
      identifier_type_id: idType.id,
      identifier_value: parsed.frame_number,
    });
  }

  // bike_state_log row is written automatically by the `trg_bikes_state_log`
  // trigger on every INSERT and status UPDATE; we don't need to write our own.

  revalidatePath("/bikes");
  redirect(`/bikes/${bike.id}`);
}
