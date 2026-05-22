"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type SOLineResult = { ok: true } | { ok: false; error: string };

/**
 * SO lines reference EITHER a part (spare/service) OR a bike_template (a
 * complete bike). Exactly one of the two FKs is set; the line dialog enforces
 * this. VAT defaults to the customer's default_vat_code; per-line override is
 * supported via the form.
 */

type ParsedLine = {
  kind: "part" | "template";
  part_id: string | null;
  bike_template_id: string | null;
  quantity: number;
  unit_price: number;
  vat_code: string | null;
  vat_rate: number;
  color_id: string | null;
  description_en: string | null;
  description_da: string | null;
};

function parsePositiveNumber(
  raw: string | null,
  field: string,
  opts: { allowZero?: boolean } = {},
): { ok: true; value: number } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: `${field} is required.` };
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${field} must be a number.` };
  }
  if (opts.allowZero ? n < 0 : n <= 0) {
    return {
      ok: false,
      error: `${field} must be ${opts.allowZero ? "non-negative" : "positive"}.`,
    };
  }
  return { ok: true, value: n };
}

async function resolveVatRate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vatCode: string | null,
): Promise<number> {
  if (!vatCode) return 0;
  const { data } = await supabase
    .from("vat_codes")
    .select("default_rate")
    .eq("code", vatCode)
    .maybeSingle();
  return Number(data?.default_rate ?? 0);
}

function parseFields(
  formData: FormData,
): { ok: true; values: Omit<ParsedLine, "vat_rate"> } | { ok: false; error: string } {
  const kindRaw = nullable(formData.get("kind"));
  if (kindRaw !== "part" && kindRaw !== "template") {
    return { ok: false, error: "Line must reference a part or a bike template." };
  }
  const kind = kindRaw;

  const part_id = kind === "part" ? nullable(formData.get("part_id")) : null;
  const bike_template_id =
    kind === "template" ? nullable(formData.get("bike_template_id")) : null;
  if (kind === "part" && !part_id) {
    return { ok: false, error: "Pick a part." };
  }
  if (kind === "template" && !bike_template_id) {
    return { ok: false, error: "Pick a bike template." };
  }

  const qty = parsePositiveNumber(nullable(formData.get("quantity")), "Quantity");
  if (!qty.ok) return { ok: false, error: qty.error };

  const price = parsePositiveNumber(
    nullable(formData.get("unit_price")),
    "Unit price",
    { allowZero: true },
  );
  if (!price.ok) return { ok: false, error: price.error };

  const vat_code = nullable(formData.get("vat_code"));
  // vat_code is optional per line — DB allows null. Domestic default is
  // applied via the customer's default_vat_code at line creation when blank.

  return {
    ok: true,
    values: {
      kind,
      part_id,
      bike_template_id,
      quantity: qty.value,
      unit_price: price.value,
      vat_code,
      color_id: nullable(formData.get("color_id")),
      description_en: nullable(formData.get("description_en")),
      description_da: nullable(formData.get("description_da")),
    },
  };
}

/**
 * Recompute SO subtotal / VAT / total from its lines. Called after every
 * line edit. Values stay in NUMERIC with 4dp precision (matches column
 * scale); rounding for display happens in the UI.
 */
async function recomputeSOTotal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  soId: string,
): Promise<void> {
  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("line_subtotal, line_vat_amount, line_total")
    .eq("sales_order_id", soId);

  let subtotal = 0;
  let vat = 0;
  let total = 0;
  for (const l of lines ?? []) {
    subtotal += Number(l.line_subtotal ?? 0);
    vat += Number(l.line_vat_amount ?? 0);
    total += Number(l.line_total ?? 0);
  }

  await supabase
    .from("sales_orders")
    .update({
      subtotal_amount: Math.round(subtotal * 10000) / 10000,
      total_vat_amount: Math.round(vat * 10000) / 10000,
      total_amount: Math.round(total * 10000) / 10000,
      updated_at: new Date().toISOString(),
    })
    .eq("id", soId);
}

async function assertDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  soId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: so } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", soId)
    .maybeSingle();
  if (!so) return { ok: false, error: "SO not found." };
  if (so.status !== "draft") {
    return {
      ok: false,
      error: `Lines are locked once SO leaves draft (currently ${so.status}).`,
    };
  }
  return { ok: true };
}

export async function addSOLine(
  soId: string,
  formData: FormData,
): Promise<SOLineResult> {
  if (!soId) return { ok: false, error: "Missing SO id." };
  const parsed = parseFields(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const guard = await assertDraft(supabase, soId);
  if (!guard.ok) return guard;

  const v = parsed.values;
  const vat_rate = await resolveVatRate(supabase, v.vat_code);

  // line_number = max(existing) + 1. Stable so the UI can render rows in
  // the same order the user added them.
  const { data: maxRow } = await supabase
    .from("sales_order_lines")
    .select("line_number")
    .eq("sales_order_id", soId)
    .order("line_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextLineNumber = (maxRow?.line_number ?? 0) + 1;

  // Compute the line money fields server-side so they're consistent
  // regardless of how the client previewed them.
  const lineSubtotal = v.quantity * v.unit_price;
  const lineVat = lineSubtotal * (vat_rate / 100);
  const lineTotal = lineSubtotal + lineVat;

  const { error } = await supabase.from("sales_order_lines").insert({
    sales_order_id: soId,
    line_number: nextLineNumber,
    part_id: v.part_id,
    bike_template_id: v.bike_template_id,
    quantity: v.quantity,
    unit_price: v.unit_price,
    vat_code: v.vat_code,
    vat_rate,
    color_id: v.color_id,
    description_en: v.description_en,
    description_da: v.description_da,
    line_subtotal: Math.round(lineSubtotal * 10000) / 10000,
    line_vat_amount: Math.round(lineVat * 10000) / 10000,
    line_total: Math.round(lineTotal * 10000) / 10000,
  });
  if (error) {
    return { ok: false, error: `Could not add line: ${error.message}` };
  }

  await recomputeSOTotal(supabase, soId);
  revalidatePath(`/sales-orders/${soId}`);
  return { ok: true };
}

export async function updateSOLine(
  lineId: string,
  formData: FormData,
): Promise<SOLineResult> {
  if (!lineId) return { ok: false, error: "Missing line id." };
  const parsed = parseFields(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { data: line } = await supabase
    .from("sales_order_lines")
    .select("id, sales_order_id")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { ok: false, error: "Line not found." };

  const guard = await assertDraft(supabase, line.sales_order_id);
  if (!guard.ok) return guard;

  const v = parsed.values;
  const vat_rate = await resolveVatRate(supabase, v.vat_code);
  const lineSubtotal = v.quantity * v.unit_price;
  const lineVat = lineSubtotal * (vat_rate / 100);
  const lineTotal = lineSubtotal + lineVat;

  const { error } = await supabase
    .from("sales_order_lines")
    .update({
      part_id: v.part_id,
      bike_template_id: v.bike_template_id,
      quantity: v.quantity,
      unit_price: v.unit_price,
      vat_code: v.vat_code,
      vat_rate,
      color_id: v.color_id,
      description_en: v.description_en,
      description_da: v.description_da,
      line_subtotal: Math.round(lineSubtotal * 10000) / 10000,
      line_vat_amount: Math.round(lineVat * 10000) / 10000,
      line_total: Math.round(lineTotal * 10000) / 10000,
    })
    .eq("id", lineId);
  if (error) {
    return { ok: false, error: `Could not update line: ${error.message}` };
  }

  await recomputeSOTotal(supabase, line.sales_order_id);
  revalidatePath(`/sales-orders/${line.sales_order_id}`);
  return { ok: true };
}

export async function deleteSOLine(lineId: string): Promise<SOLineResult> {
  if (!lineId) return { ok: false, error: "Missing line id." };

  const supabase = await createClient();
  const { data: line } = await supabase
    .from("sales_order_lines")
    .select("id, sales_order_id")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { ok: false, error: "Line not found." };

  const guard = await assertDraft(supabase, line.sales_order_id);
  if (!guard.ok) return guard;

  // Block delete if a MO was already spawned from this line — the link
  // should be unwound deliberately (cancel the MO first) rather than
  // silently orphaned.
  const { count: linkedMoCount } = await supabase
    .from("manufacturing_orders")
    .select("id", { count: "exact", head: true })
    .eq("sales_order_line_id", lineId);
  if ((linkedMoCount ?? 0) > 0) {
    return {
      ok: false,
      error: `Cannot delete: ${linkedMoCount} manufacturing order${linkedMoCount === 1 ? "" : "s"} reference this line. Cancel the MO first.`,
    };
  }

  const { error } = await supabase
    .from("sales_order_lines")
    .delete()
    .eq("id", lineId);
  if (error) {
    return { ok: false, error: `Could not delete: ${error.message}` };
  }

  await recomputeSOTotal(supabase, line.sales_order_id);
  revalidatePath(`/sales-orders/${line.sales_order_id}`);
  return { ok: true };
}
