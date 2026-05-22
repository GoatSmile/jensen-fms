"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SaveSOResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

type ParsedSOFields = {
  organization_id: string;
  organization_unit_id: string | null;
  contact_id: string | null;
  language: string;
  order_date: string;
  requested_delivery_date: string | null;
  currency: string;
  notes: string | null;
};

function parseFields(
  formData: FormData,
): { ok: true; values: ParsedSOFields } | { ok: false; error: string; field?: string } {
  const organization_id = nullable(formData.get("organization_id"));
  if (!organization_id) {
    return { ok: false, error: "Pick a customer.", field: "organization_id" };
  }

  const language = (nullable(formData.get("language")) ?? "da").toLowerCase();
  if (language !== "da" && language !== "en") {
    return { ok: false, error: "Language must be da or en.", field: "language" };
  }

  const order_date = nullable(formData.get("order_date"));
  if (!order_date) {
    return { ok: false, error: "Order date is required.", field: "order_date" };
  }

  const currency = (nullable(formData.get("currency")) ?? "DKK").toUpperCase();
  if (currency.length !== 3) {
    return { ok: false, error: "Pick a currency.", field: "currency" };
  }

  return {
    ok: true,
    values: {
      organization_id,
      organization_unit_id: nullable(formData.get("organization_unit_id")),
      contact_id: nullable(formData.get("contact_id")),
      language,
      order_date,
      requested_delivery_date: nullable(formData.get("requested_delivery_date")),
      currency,
      notes: nullable(formData.get("notes")),
    },
  };
}

/**
 * Create a new sales order in draft. Number is allocated via
 * next_document_number('sales_order') so it stays in lockstep with the rest
 * of the document numbering. Lines come later via manage-so-lines.
 */
export async function createSO(formData: FormData): Promise<SaveSOResult> {
  const parsed = parseFields(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();

  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "sales_order" },
  );
  if (numErr || !numberData) {
    return {
      ok: false,
      error: `Could not allocate SO number: ${numErr?.message ?? "unknown"}`,
    };
  }

  const { data, error } = await supabase
    .from("sales_orders")
    .insert({
      sales_order_number: numberData,
      status: "draft",
      ...parsed.values,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: `Could not create SO: ${error?.message ?? "unknown"}` };
  }

  revalidatePath("/sales-orders");
  redirect(`/sales-orders/${data.id}`);
}

/**
 * Update SO header. Only allowed while draft — once confirmed the customer +
 * dates are part of the customer-facing commitment. (Status moves and
 * line edits live in their own actions.)
 */
export async function updateSO(
  soId: string,
  formData: FormData,
): Promise<SaveSOResult> {
  if (!soId) return { ok: false, error: "Missing SO id." };
  const parsed = parseFields(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { data: existing, error: lookupErr } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", soId)
    .maybeSingle();
  if (lookupErr || !existing) {
    return {
      ok: false,
      error: `Could not load SO: ${lookupErr?.message ?? "not found"}`,
    };
  }
  if (existing.status !== "draft") {
    return {
      ok: false,
      error: `Header is locked once SO leaves draft (currently ${existing.status}).`,
    };
  }

  const { error } = await supabase
    .from("sales_orders")
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq("id", soId);
  if (error) {
    return { ok: false, error: `Could not save SO: ${error.message}` };
  }

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${soId}`);
  return { ok: true, id: soId };
}
