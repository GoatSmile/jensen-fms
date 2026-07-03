"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SavePaintOrderResult =
  | { ok: true; paintOrderId: string }
  | { ok: false; error: string; field?: string };

function parsePrice(
  raw: string | null,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: null };
  const normalized = raw.replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Cost must be a non-negative number." };
  }
  return { ok: true, value: n };
}

/**
 * Create a paint order. The order number is allocated server-side via
 * `next_document_number('paint_order')` and yields PNT-YYYY-NNNN. Status
 * starts at `planned`; sent_at / received_at are stamped later by status
 * transitions. After insert we redirect to the detail page where the user
 * adds bikes to the batch.
 */
export async function createPaintOrder(
  formData: FormData,
): Promise<SavePaintOrderResult> {
  const supplier_id = nullable(formData.get("supplier_id"));
  const color_id = nullable(formData.get("color_id"));
  const paint_part_id = nullable(formData.get("paint_part_id"));
  const planned_send_date = nullable(formData.get("planned_send_date"));
  const notes = nullable(formData.get("notes"));

  if (!supplier_id) {
    return { ok: false, error: "Pick a supplier.", field: "supplier_id" };
  }
  // Colour is now an optional batch DEFAULT (per-line colour lives on each
  // paint_order_bikes row and is set as frames are added).

  const priceParsed = parsePrice(nullable(formData.get("unit_cost")));
  if (!priceParsed.ok) {
    return { ok: false, error: priceParsed.error, field: "unit_cost" };
  }
  const unit_cost = priceParsed.value;
  const unit_cost_currency =
    unit_cost == null
      ? null
      : nullable(formData.get("unit_cost_currency")) ?? "DKK";

  const supabase = await createClient();

  // Document number via the Postgres helper.
  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "paint_order" },
  );
  if (numErr || typeof numberData !== "string") {
    return {
      ok: false,
      error: `Could not allocate paint-order number: ${numErr?.message ?? "unknown error"}`,
    };
  }

  const { data, error } = await supabase
    .from("paint_orders")
    .insert({
      paint_order_number: numberData,
      supplier_id,
      color_id,
      paint_part_id,
      status: "planned",
      planned_send_date,
      unit_cost,
      unit_cost_currency,
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
