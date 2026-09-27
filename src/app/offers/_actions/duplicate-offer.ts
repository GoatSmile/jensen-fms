"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { OFFER_LINE_ENTITY } from "@/lib/offers/line-images";

export type DuplicateOfferResult =
  | { ok: true; offerId: string }
  | { ok: false; error: string };

/**
 * Start a NEW draft offer from an existing one — same customer, language,
 * currency and lines (pictures included) — under a fresh `OFF-` number.
 *
 * Asked for on 15 Sep (01:01:09: "I wanna be able to reuse a converted
 * offer"). It is not a revision: a revision keeps its number and reopens THIS
 * offer, and a converted offer cannot reopen at all. A duplicate is a second
 * document that happens to start with the first one's content, so it works
 * from any status, and the original is untouched.
 *
 * Copied as data, like conversion: the lines keep their prices and VAT as
 * quoted — the draft is where they get re-priced if they should be. Pictures
 * are attachment rows pointing at the SAME file; files in that bucket are never
 * hard-deleted (a sent document holds their URL), so sharing one is safe.
 * `issued_date` / `expiry_date` stay empty: they are stamped at send.
 */
export async function duplicateOffer(offerId: string): Promise<DuplicateOfferResult> {
  const t = await getTranslations("errors");
  if (!offerId) return { ok: false, error: t("missingOfferId") };

  const supabase = await createClient();
  const { data: offer } = await supabase
    .from("offers")
    .select(
      "id, offer_number, organization_id, organization_unit_id, contact_id, language, currency, notes, subtotal_amount, total_vat_amount, total_amount",
    )
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return { ok: false, error: t("offerNotFound") };

  const { data: lines, error: linesErr } = await supabase
    .from("offer_lines")
    .select(
      "id, line_number, part_id, bike_template_id, color_id, description_en, description_da, quantity, unit_price, vat_code, vat_rate, line_subtotal, line_vat_amount, line_total",
    )
    .eq("offer_id", offerId)
    .order("line_number");
  if (linesErr) {
    return { ok: false, error: t("offerCouldNotDuplicate", { detail: linesErr.message }) };
  }

  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "offer" },
  );
  if (numErr || !numberData) {
    return {
      ok: false,
      error: t("offerCouldNotAllocateNumber", {
        detail: numErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { data: created, error: createErr } = await supabase
    .from("offers")
    .insert({
      offer_number: numberData,
      status: "draft",
      organization_id: offer.organization_id,
      organization_unit_id: offer.organization_unit_id,
      contact_id: offer.contact_id,
      language: offer.language,
      currency: offer.currency,
      // Internal notes travel: a TEST marker must come along, and so must
      // whatever the office wrote about this customer's requirements.
      notes: offer.notes,
      subtotal_amount: offer.subtotal_amount,
      total_vat_amount: offer.total_vat_amount,
      total_amount: offer.total_amount,
    })
    .select("id")
    .single();
  if (createErr || !created) {
    return {
      ok: false,
      error: t("offerCouldNotDuplicate", { detail: createErr?.message ?? t("unknownError") }),
    };
  }

  if ((lines ?? []).length > 0) {
    const { data: newLines, error: copyErr } = await supabase
      .from("offer_lines")
      .insert(
        (lines ?? []).map((l) => ({
          offer_id: created.id,
          line_number: l.line_number,
          part_id: l.part_id,
          bike_template_id: l.bike_template_id,
          color_id: l.color_id,
          description_en: l.description_en,
          description_da: l.description_da,
          quantity: l.quantity,
          unit_price: l.unit_price,
          vat_code: l.vat_code,
          vat_rate: l.vat_rate,
          line_subtotal: l.line_subtotal,
          line_vat_amount: l.line_vat_amount,
          line_total: l.line_total,
        })),
      )
      .select("id, line_number");
    if (copyErr) {
      return {
        ok: false,
        error: t("offerDuplicatedLinesFailed", { number: numberData, detail: copyErr.message }),
      };
    }

    // Pictures: one attachment row per line that had one, same file.
    const oldIdByNumber = new Map((lines ?? []).map((l) => [l.line_number, l.id]));
    const newIdByOld = new Map<string, string>();
    for (const nl of newLines ?? []) {
      const oldId = oldIdByNumber.get(nl.line_number);
      if (oldId) newIdByOld.set(oldId, nl.id);
    }
    const service = createServiceClient();
    const { data: images } = await service
      .from("attachments")
      .select("entity_id, file_url, file_name, file_size_bytes, mime_type, purpose")
      .eq("entity_type", OFFER_LINE_ENTITY)
      .in("entity_id", [...newIdByOld.keys()])
      .is("deleted_at", null);
    const copies = (images ?? [])
      .filter((img) => newIdByOld.has(img.entity_id))
      .map((img) => ({
        entity_type: OFFER_LINE_ENTITY,
        entity_id: newIdByOld.get(img.entity_id) as string,
        file_url: img.file_url,
        file_name: img.file_name,
        file_size_bytes: img.file_size_bytes,
        mime_type: img.mime_type,
        purpose: img.purpose,
      }));
    if (copies.length > 0) {
      // A missing picture is not worth failing a duplicate over: the lines are
      // there, and a picture can be added again on the draft.
      const { error: imgErr } = await service.from("attachments").insert(copies);
      if (imgErr) console.warn(`duplicateOffer: pictures not copied: ${imgErr.message}`);
    }
  }

  revalidatePath("/offers");
  redirect(`/offers/${created.id}`);
}
