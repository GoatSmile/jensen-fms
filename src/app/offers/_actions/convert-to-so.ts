"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { canConvertToSalesOrder, type OfferStatus } from "@/lib/offers/status";

export type ConvertOfferResult =
  | { ok: true; salesOrderId: string; salesOrderNumber: string }
  | { ok: false; error: string };

/**
 * Turn an accepted offer into a sales order.
 *
 * The lines are COPIED, not referenced: from here on the order is edited as an
 * order, and the offer keeps saying what the customer actually agreed to. Same
 * reasoning as the MO recipe snapshotting into `bike_parts` — a document that
 * changes underneath its own history is worse than a duplicated row.
 *
 * `sales_orders.converted_from_offer_id` is the link back, and the offer lands
 * in `converted`, from which it can no longer be reopened.
 */
export async function convertOfferToSalesOrder(
  offerId: string,
): Promise<ConvertOfferResult> {
  const t = await getTranslations("errors");
  if (!offerId) return { ok: false, error: t("missingOfferId") };

  const supabase = await createClient();

  const { data: offer } = await supabase
    .from("offers")
    .select(
      "id, offer_number, status, organization_id, organization_unit_id, contact_id, language, currency, notes, subtotal_amount, total_vat_amount, total_amount",
    )
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return { ok: false, error: t("offerNotFound") };

  if (!canConvertToSalesOrder(offer.status as OfferStatus)) {
    return {
      ok: false,
      error: t("offerCannotConvert", { status: offer.status }),
    };
  }

  const { data: lines, error: linesErr } = await supabase
    .from("offer_lines")
    .select(
      "line_number, part_id, bike_template_id, color_id, description_en, description_da, quantity, unit_price, vat_code, vat_rate, line_subtotal, line_vat_amount, line_total",
    )
    .eq("offer_id", offerId)
    .order("line_number");
  if (linesErr) {
    return { ok: false, error: t("offerCouldNotConvert", { detail: linesErr.message }) };
  }
  if (!lines || lines.length === 0) {
    return { ok: false, error: t("offerNeedsLine") };
  }

  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "sales_order" },
  );
  if (numErr || !numberData) {
    return {
      ok: false,
      error: t("soCouldNotAllocateNumber", {
        detail: numErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { data: so, error: soErr } = await supabase
    .from("sales_orders")
    .insert({
      sales_order_number: numberData,
      converted_from_offer_id: offerId,
      organization_id: offer.organization_id,
      organization_unit_id: offer.organization_unit_id,
      contact_id: offer.contact_id,
      language: offer.language,
      status: "draft",
      order_date: new Date().toISOString().slice(0, 10),
      currency: offer.currency,
      notes: offer.notes,
      subtotal_amount: offer.subtotal_amount,
      total_vat_amount: offer.total_vat_amount,
      total_amount: offer.total_amount,
    })
    .select("id, sales_order_number")
    .single();
  if (soErr || !so) {
    return {
      ok: false,
      error: t("offerCouldNotConvert", {
        detail: soErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { error: copyErr } = await supabase.from("sales_order_lines").insert(
    lines.map((l) => ({
      sales_order_id: so.id,
      line_number: l.line_number,
      part_id: l.part_id,
      bike_template_id: l.bike_template_id,
      color_id: l.color_id,
      description_en: l.description_en,
      description_da: l.description_da,
      quantity: l.quantity,
      // offer_lines.unit_price is nullable, sales_order_lines' is not. Every
      // line written through the app has a price; 0 is the honest fallback for
      // anything that predates that.
      unit_price: l.unit_price ?? 0,
      vat_code: l.vat_code,
      vat_rate: l.vat_rate,
      line_subtotal: l.line_subtotal,
      line_vat_amount: l.line_vat_amount,
      line_total: l.line_total,
    })),
  );
  if (copyErr) {
    // The order exists but is empty — say so rather than reporting success.
    return {
      ok: false,
      error: t("offerConvertedLinesFailed", {
        so: so.sales_order_number,
        detail: copyErr.message,
      }),
    };
  }

  await supabase
    .from("offers")
    .update({ status: "converted", updated_at: new Date().toISOString() })
    .eq("id", offerId);

  revalidatePath(`/offers/${offerId}`);
  revalidatePath("/offers");
  revalidatePath("/sales-orders");
  redirect(`/sales-orders/${so.id}`);
}
