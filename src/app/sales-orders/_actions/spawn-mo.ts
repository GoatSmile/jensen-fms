"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SpawnMOResult =
  | { ok: true; moId: string }
  | { ok: false; error: string };

/**
 * Spawn a manufacturing order from a sales order line.
 *
 * Pre-conditions:
 *   - Line must reference a bike_template (not a part).
 *   - SO is `draft` or `confirmed` — spawning during in_production is fine
 *     too (sometimes a customer adds bikes mid-flight) but cancelled /
 *     delivered SOs shouldn't be sprouting new MOs.
 *
 * Mapping:
 *   - target_quantity = line.quantity
 *   - bike_template_id = line.bike_template_id (we pull bike_type_id from
 *     the template, same logic as the existing MO new page)
 *   - color_id = line.color_id (the customer's chosen colour for this line)
 *   - sales_order_id + sales_order_line_id = links back
 *   - status = `planned` (the MO matrix's starting state)
 *
 * v1 is one MO per line. Future "split into two batches" lives in a
 * separate action; the schema already allows N-MOs-per-line.
 */
export async function spawnMOFromSOLine(
  soId: string,
  lineId: string,
): Promise<SpawnMOResult> {
  if (!soId || !lineId) {
    return { ok: false, error: "Missing SO id or line id." };
  }

  const supabase = await createClient();

  const { data: line, error: lineErr } = await supabase
    .from("sales_order_lines")
    .select(
      `id, sales_order_id, bike_template_id, quantity, color_id,
       template:bike_templates!bike_template_id(id, bike_type_id, is_current)`,
    )
    .eq("id", lineId)
    .maybeSingle();
  if (lineErr || !line) {
    return {
      ok: false,
      error: `Could not load SO line: ${lineErr?.message ?? "not found"}`,
    };
  }
  if (line.sales_order_id !== soId) {
    return { ok: false, error: "That line doesn't belong to this SO." };
  }
  if (!line.bike_template_id || !line.template) {
    return {
      ok: false,
      error: "Only bike-template lines can spawn an MO. Use a part line for spares.",
    };
  }
  if (!line.template.is_current) {
    return {
      ok: false,
      error:
        "That template is not the current version. Edit the SO line to point at the current template before spawning.",
    };
  }
  if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
    return { ok: false, error: "Line quantity must be positive." };
  }

  const { data: so, error: soErr } = await supabase
    .from("sales_orders")
    .select("id, status, requested_delivery_date")
    .eq("id", soId)
    .maybeSingle();
  if (soErr || !so) {
    return {
      ok: false,
      error: `Could not load SO: ${soErr?.message ?? "not found"}`,
    };
  }
  if (so.status === "cancelled" || so.status === "delivered") {
    return {
      ok: false,
      error: `Cannot spawn an MO from a ${so.status} SO.`,
    };
  }

  // Defensive: refuse if a non-cancelled MO already exists for this line.
  // Future "split" lives in its own action.
  const { count: existing } = await supabase
    .from("manufacturing_orders")
    .select("id", { count: "exact", head: true })
    .eq("sales_order_line_id", lineId)
    .neq("status", "cancelled");
  if ((existing ?? 0) > 0) {
    return {
      ok: false,
      error:
        "An active MO already exists for this line. Cancel it before spawning another.",
    };
  }

  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "manufacturing_order" },
  );
  if (numErr || !numberData) {
    return {
      ok: false,
      error: `Could not allocate MO number: ${numErr?.message ?? "unknown"}`,
    };
  }

  const { data: mo, error: moErr } = await supabase
    .from("manufacturing_orders")
    .insert({
      mo_number: numberData,
      status: "planned",
      bike_type_id: line.template.bike_type_id,
      bike_template_id: line.bike_template_id,
      color_id: line.color_id,
      target_quantity: Math.trunc(Number(line.quantity)),
      completed_quantity: 0,
      sales_order_id: soId,
      sales_order_line_id: lineId,
      planned_completion_date: so.requested_delivery_date ?? null,
    })
    .select("id")
    .single();
  if (moErr || !mo) {
    return {
      ok: false,
      error: `Could not create MO: ${moErr?.message ?? "unknown"}`,
    };
  }

  // Copy the template's parts into manufacturing_order_parts so the recipe
  // is ready when the build floor opens the MO. Match the pattern used by
  // the existing template-driven save-mo path.
  const { data: tplParts } = await supabase
    .from("bike_template_parts")
    .select("part_id, quantity, is_optional, notes")
    .eq("template_id", line.bike_template_id);
  if (tplParts && tplParts.length > 0) {
    const rows = tplParts.map((p) => ({
      manufacturing_order_id: mo.id,
      part_id: p.part_id,
      quantity_per_bike: Number(p.quantity),
      origin: "template",
      notes: p.notes,
    }));
    await supabase.from("manufacturing_order_parts").insert(rows);
  }

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${soId}`);
  revalidatePath("/manufacturing-orders");
  redirect(`/manufacturing-orders/${mo.id}`);
}
