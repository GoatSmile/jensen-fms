"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SavePOResult =
  | { ok: true; poId: string }
  | { ok: false; error: string; field?: string };

/**
 * Create a draft purchase order. The PO number is allocated server-side via
 * `next_document_number('purchase_order')` and yields `PO-YYYY-NNNN`. Status
 * starts at `draft`; lines are added on the detail page and the user moves
 * the PO to `placed` once the order has actually gone out.
 *
 * `total_currency` defaults to the supplier's `default_currency` when the
 * user didn't pick one. `total_amount` stays null until the first line lands
 * — the lines-management actions recompute it then.
 */
export async function createPO(formData: FormData): Promise<SavePOResult> {
  const t = await getTranslations("errors");
  const supplier_id = nullable(formData.get("supplier_id"));
  const order_date_raw = nullable(formData.get("order_date"));
  const expected_date = nullable(formData.get("expected_date"));
  const total_currency_in = nullable(formData.get("total_currency"));
  const notes = nullable(formData.get("notes"));

  if (!supplier_id) {
    return { ok: false, error: t("pickSupplier"), field: "supplier_id" };
  }

  const order_date =
    order_date_raw ?? new Date().toISOString().slice(0, 10);

  const supabase = await createClient();

  // Resolve the default currency from the supplier when the form didn't carry
  // one — keeps the create flow snappy for new users who haven't touched the
  // currency picker yet.
  let total_currency = total_currency_in;
  if (!total_currency) {
    const { data: sup } = await supabase
      .from("suppliers")
      .select("default_currency")
      .eq("id", supplier_id)
      .maybeSingle();
    total_currency = sup?.default_currency ?? "DKK";
  }

  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "purchase_order" },
  );
  if (numErr || typeof numberData !== "string") {
    return {
      ok: false,
      error: t("poCouldNotAllocateNumber", {
        detail: numErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: numberData,
      supplier_id,
      status: "draft",
      order_date,
      expected_date,
      total_currency,
      notes,
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: t("poCouldNotCreate", {
        detail: error?.message ?? t("unknownError"),
      }),
    };
  }

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${data.id}`);
}

/**
 * Update the header of a draft PO. Refused once status leaves `draft` — at
 * that point the lines and supplier are baked into the audit trail and we
 * don't want a clerical edit to silently reshape a placed order. Also refuses
 * a supplier swap if any lines exist (would invalidate already-priced lines).
 */
export async function updatePO(
  poId: string,
  formData: FormData,
): Promise<SavePOResult> {
  const t = await getTranslations("errors");
  if (!poId) return { ok: false, error: t("missingPoId") };

  const supplier_id = nullable(formData.get("supplier_id"));
  const order_date_raw = nullable(formData.get("order_date"));
  const expected_date = nullable(formData.get("expected_date"));
  const total_currency_in = nullable(formData.get("total_currency"));
  const notes = nullable(formData.get("notes"));

  if (!supplier_id) {
    return { ok: false, error: t("pickSupplier"), field: "supplier_id" };
  }
  if (!order_date_raw) {
    return {
      ok: false,
      error: t("orderDateRequired"),
      field: "order_date",
    };
  }

  const supabase = await createClient();
  const { data: po, error: lookupErr } = await supabase
    .from("purchase_orders")
    .select("id, status, supplier_id")
    .eq("id", poId)
    .maybeSingle();
  if (lookupErr || !po) {
    return {
      ok: false,
      error: t("poCouldNotLoad", { detail: lookupErr?.message ?? t("notFound") }),
    };
  }
  if (po.status !== "draft") {
    return {
      ok: false,
      error: t("poOnlyDraftEditable"),
    };
  }

  if (po.supplier_id !== supplier_id) {
    const { count, error: linesErr } = await supabase
      .from("purchase_order_lines")
      .select("id", { count: "exact", head: true })
      .eq("purchase_order_id", poId);
    if (linesErr) {
      return {
        ok: false,
        error: t("poCouldNotCheckExistingLines", { detail: linesErr.message }),
      };
    }
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: t("poCannotChangeSupplier"),
        field: "supplier_id",
      };
    }
  }

  const total_currency = total_currency_in ?? "DKK";

  const { error: updErr } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id,
      order_date: order_date_raw,
      expected_date,
      total_currency,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", poId);
  if (updErr) {
    return { ok: false, error: t("poCouldNotUpdate", { detail: updErr.message }) };
  }

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${poId}`);
  redirect(`/purchase-orders/${poId}`);
}
