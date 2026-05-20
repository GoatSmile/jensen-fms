"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SaveMOResult =
  | { ok: true; moId: string }
  | { ok: false; error: string; field?: string };

/**
 * Create a manufacturing order. Two paths:
 *
 *   1. Template-driven (bike_template_id present): MO inherits bike_type from
 *      the template. Color is required (one MO = one template × one color ×
 *      N bikes). After insert, we seed manufacturing_order_parts from
 *      bike_template_parts via the `mo_copy_template_parts` RPC.
 *
 *   2. One-off (no template): caller picks bike_type by hand. Color optional.
 *      The MO is created with an empty BOM; the user assembles parts on the
 *      detail page.
 *
 * Document number comes from `next_document_number('manufacturing_order')`.
 */
export async function createManufacturingOrder(
  formData: FormData,
): Promise<SaveMOResult> {
  const bike_template_id = nullable(formData.get("bike_template_id"));
  const bike_type_id_input = nullable(formData.get("bike_type_id"));
  const color_id = nullable(formData.get("color_id"));
  const targetRaw = nullable(formData.get("target_quantity"));
  const planned_start_date = nullable(formData.get("planned_start_date"));
  const planned_completion_date = nullable(
    formData.get("planned_completion_date"),
  );
  const notes = nullable(formData.get("notes"));

  if (!targetRaw) {
    return {
      ok: false,
      error: "Target quantity is required.",
      field: "target_quantity",
    };
  }
  const target_quantity = Number(targetRaw);
  if (
    !Number.isFinite(target_quantity) ||
    !Number.isInteger(target_quantity) ||
    target_quantity <= 0
  ) {
    return {
      ok: false,
      error: "Target quantity must be a positive whole number.",
      field: "target_quantity",
    };
  }

  const supabase = await createClient();

  let resolvedBikeTypeId: string;

  if (bike_template_id) {
    // Template-driven: pull bike_type_id and ensure the template is current.
    const { data: tpl, error: tplErr } = await supabase
      .from("bike_templates")
      .select("id, bike_type_id, is_current")
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
    if (!color_id) {
      return {
        ok: false,
        error: "Pick a colour — one MO covers one template and one colour.",
        field: "color_id",
      };
    }
    resolvedBikeTypeId = tpl.bike_type_id;
  } else {
    // One-off: bike_type is required from the user.
    if (!bike_type_id_input) {
      return {
        ok: false,
        error: "Pick a bike type for the one-off build.",
        field: "bike_type_id",
      };
    }
    resolvedBikeTypeId = bike_type_id_input;
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
      bike_template_id: bike_template_id,
      bike_type_id: resolvedBikeTypeId,
      color_id: color_id,
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

  // Seed the parts list from the template when present. One-off MOs start
  // with an empty BOM; the user adds parts on the detail page.
  if (bike_template_id) {
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
  }

  revalidatePath("/manufacturing-orders");
  redirect(`/manufacturing-orders/${mo.id}`);
}
