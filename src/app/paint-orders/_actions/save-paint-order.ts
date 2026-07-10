"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { PAINT_SERVICE_SLUG, loadServiceTypeBySlug } from "@/lib/services/vocab";

export type SavePaintOrderResult =
  | { ok: true; serviceOrderId: string }
  | { ok: false; error: string; field?: string };

/**
 * Create a paint order (a service order of the painting type). The order
 * number is allocated server-side via the type's document_type —
 * `next_document_number('paint_order')` → PNT-YYYY-NNNN, unbroken series.
 * Status starts at `planned`; sent_at / received_at are stamped by status
 * transitions. Costing lives on service_order_items (added on the detail
 * page, priced live from the supplier's current price list, frozen at send).
 */
export async function createPaintOrder(
  formData: FormData,
): Promise<SavePaintOrderResult> {
  const supplier_id = nullable(formData.get("supplier_id"));
  const color_id = nullable(formData.get("color_id"));
  const planned_send_date = nullable(formData.get("planned_send_date"));
  const notes = nullable(formData.get("notes"));

  if (!supplier_id) {
    return { ok: false, error: "Pick a supplier.", field: "supplier_id" };
  }
  // Colour is an optional batch DEFAULT — it pre-fills new item lines.

  const supabase = await createClient();

  const serviceType = await loadServiceTypeBySlug(supabase, PAINT_SERVICE_SLUG);
  if (!serviceType) {
    return { ok: false, error: "Painting service type is missing." };
  }

  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: serviceType.document_type },
  );
  if (numErr || typeof numberData !== "string") {
    return {
      ok: false,
      error: `Could not allocate paint-order number: ${numErr?.message ?? "unknown error"}`,
    };
  }

  const { data, error } = await supabase
    .from("service_orders")
    .insert({
      order_number: numberData,
      service_type_id: serviceType.id,
      supplier_id,
      color_id,
      status: "planned",
      planned_send_date,
      notes,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: `Could not create paint order: ${error?.message ?? "unknown error"}`,
    };
  }

  revalidatePath("/paint-orders");
  redirect(`/paint-orders/${data.id}`);
}
