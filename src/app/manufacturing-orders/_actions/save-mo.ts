"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SaveMOResult =
  | { ok: true; moId: string }
  | { ok: false; error: string; field?: string };

function nullable(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Create a manufacturing order from a bike template. Steps:
 *   1. Resolve the template's model/variant/type so the MO carries them
 *      directly (avoids depending on the template version forever).
 *   2. Generate the MO number via the `next_document_number('manufacturing_order')`
 *      Postgres function — yields MO-yyyy-nnnn.
 *   3. Insert the MO row.
 *   4. Call `mo_copy_template_parts(mo_id)` to seed `manufacturing_order_parts`
 *      from the template's recipe with origin='template'.
 *
 * If the parts copy fails after the MO is created we still redirect so the
 * user sees the row — they can re-trigger the copy or add parts manually.
 */
export async function createManufacturingOrder(
  formData: FormData,
): Promise<SaveMOResult> {
  const bike_template_id = nullable(formData.get("bike_template_id"));
  const targetRaw = nullable(formData.get("target_quantity"));
  const planned_start_date = nullable(formData.get("planned_start_date"));
  const planned_completion_date = nullable(
    formData.get("planned_completion_date"),
  );
  const notes = nullable(formData.get("notes"));

  if (!bike_template_id) {
    return { ok: false, error: "Pick a template.", field: "bike_template_id" };
  }
  if (!targetRaw) {
    return { ok: false, error: "Target quantity is required.", field: "target_quantity" };
  }
  const target_quantity = Number(targetRaw);
  if (!Number.isFinite(target_quantity) || !Number.isInteger(target_quantity) || target_quantity <= 0) {
    return {
      ok: false,
      error: "Target quantity must be a positive whole number.",
      field: "target_quantity",
    };
  }

  const supabase = await createClient();

  // Resolve the template's catalog references.
  const { data: tpl, error: tplErr } = await supabase
    .from("bike_templates")
    .select(
      "id, bike_model_id, bike_model_variant_id, bike_type_id, is_current",
    )
    .eq("id", bike_template_id)
    .maybeSingle();
  if (tplErr || !tpl) {
    return {
      ok: false,
      error: `Could not load template: ${tplErr?.message ?? "not found"}`,
    };
  }
  if (!tpl.is_current) {
    return {
      ok: false,
      error:
        "That template is a past version. Pick the current version instead.",
      field: "bike_template_id",
    };
  }

  // Document number via the Postgres helper.
  const { data: moNumberData, error: moNumErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "manufacturing_order" },
  );
  if (moNumErr || typeof moNumberData !== "string") {
    return {
      ok: false,
      error: `Could not allocate MO number: ${moNumErr?.message ?? "unknown error"}`,
    };
  }

  const { data: mo, error: insErr } = await supabase
    .from("manufacturing_orders")
    .insert({
      mo_number: moNumberData,
      bike_template_id: tpl.id,
      bike_model_id: tpl.bike_model_id,
      bike_model_variant_id: tpl.bike_model_variant_id,
      bike_type_id: tpl.bike_type_id,
      target_quantity,
      status: "planned",
      planned_start_date,
      planned_completion_date,
      notes,
    })
    .select("id")
    .single();
  if (insErr || !mo) {
    return {
      ok: false,
      error: `Could not create MO: ${insErr?.message ?? "unknown error"}`,
    };
  }

  // Seed the parts list. Failure here is recoverable — the user can edit the
  // parts on the detail page.
  const { error: copyErr } = await supabase.rpc("mo_copy_template_parts", {
    p_mo_id: mo.id,
  });
  if (copyErr) {
    // Don't block the redirect — surface a soft warning later if we add a
    // toast layer. The detail page already supports manual part adds.
    console.warn(
      `MO ${mo.id} created but template parts copy failed: ${copyErr.message}`,
    );
  }

  revalidatePath("/manufacturing-orders");
  redirect(`/manufacturing-orders/${mo.id}`);
}
