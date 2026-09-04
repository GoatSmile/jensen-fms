"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { isOfferEditable, type OfferStatus } from "@/lib/offers/status";
import { OFFER_LINE_ENTITY } from "@/lib/offers/line-images";

/** Shared with parts and bikes; the offer's picture IS a picture of a bike. */
const BUCKET = "bike-images";

export type LineImageResult = { ok: true } | { ok: false; error: string };

/** Lines freeze when the offer is sent, and so does the picture — it is part of
 *  what the customer was shown. */
async function assertLineEditable(
  lineId: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): Promise<{ ok: true; offerId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: line } = await supabase
    .from("offer_lines")
    .select("offer_id")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { ok: false, error: t("lineNotFound") };

  const { data: offer } = await supabase
    .from("offers")
    .select("status")
    .eq("id", line.offer_id)
    .maybeSingle();
  if (!offer) return { ok: false, error: t("offerNotFound") };
  if (!isOfferEditable(offer.status as OfferStatus)) {
    return { ok: false, error: t("offerLinesLocked", { status: offer.status }) };
  }
  return { ok: true, offerId: line.offer_id };
}

/**
 * Attach a picture to one offer line.
 *
 * Dennis, 3 September: *"I should be able to attach [a picture] to this order
 * for two reasons. One then the production has a visual statement of how the
 * bike will look and two the customer can see this is approximately how the
 * bike will look."* This is the near-term half of that — a picture he already
 * has, from the designer or from the customer. Generating one from the
 * logocykler layers is a separate, larger piece (B′ in STATUS).
 *
 * Row-first, file-second, same as `uploadPartImage`: the worst case is a row
 * pointing at a not-yet-uploaded path, which renders a broken thumbnail someone
 * can act on, rather than an invisible orphan in the bucket.
 */
export async function uploadOfferLineImage(
  formData: FormData,
): Promise<LineImageResult> {
  const t = await getTranslations("errors");
  const lineId = formData.get("lineId");
  const file = formData.get("file");

  if (typeof lineId !== "string" || lineId.length === 0) {
    return { ok: false, error: t("missingLineId") };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t("partNoFile") };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: t("partFileTooLarge") };
  }

  const guard = await assertLineEditable(lineId, t);
  if (!guard.ok) return guard;

  const service = createServiceClient();
  const ext = file.type === "image/jpeg" ? "jpg" : "webp";
  const objectPath = `offer-lines/${lineId}/${crypto.randomUUID()}.${ext}`;
  const {
    data: { publicUrl },
  } = service.storage.from(BUCKET).getPublicUrl(objectPath);

  const { data: inserted, error: insertErr } = await service
    .from("attachments")
    .insert({
      entity_type: OFFER_LINE_ENTITY,
      entity_id: lineId,
      file_url: publicUrl,
      file_name: file.name || objectPath,
      file_size_bytes: file.size,
      mime_type: file.type || "image/webp",
      purpose: "hero",
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return {
      ok: false,
      error: t("partCouldNotSaveAttachment", {
        detail: insertErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(objectPath, file, {
      contentType: file.type === "image/jpeg" ? "image/jpeg" : "image/webp",
      upsert: false,
    });
  if (uploadErr) {
    await service.from("attachments").delete().eq("id", inserted.id);
    return {
      ok: false,
      error: t("partUploadFailed", { detail: uploadErr.message }),
    };
  }

  // One per line: retire whatever was there before, but only AFTER the new file
  // is safely up, so a failed upload never leaves the line with no picture.
  await service
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("entity_type", OFFER_LINE_ENTITY)
    .eq("entity_id", lineId)
    .is("deleted_at", null)
    .neq("id", inserted.id);

  revalidatePath(`/offers/${guard.offerId}`);
  return { ok: true };
}

/**
 * Remove the picture from a line.
 *
 * SOFT delete, and the file stays in the bucket: a sent offer's frozen document
 * holds this URL, and hard-deleting would put a broken image into a document the
 * customer already has.
 */
export async function removeOfferLineImage(
  lineId: string,
): Promise<LineImageResult> {
  const t = await getTranslations("errors");
  if (!lineId) return { ok: false, error: t("missingLineId") };

  const guard = await assertLineEditable(lineId, t);
  if (!guard.ok) return guard;

  const service = createServiceClient();
  const { error } = await service
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("entity_type", OFFER_LINE_ENTITY)
    .eq("entity_id", lineId)
    .is("deleted_at", null);
  if (error) {
    return { ok: false, error: t("couldNotDelete", { detail: error.message }) };
  }

  revalidatePath(`/offers/${guard.offerId}`);
  return { ok: true };
}
