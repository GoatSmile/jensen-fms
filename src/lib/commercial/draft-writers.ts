/**
 * Pure draft writers — create draft customers / sales orders from TYPED args,
 * with no FormData parsing and no redirect(), so they compose from any caller
 * (the voice-command apply path today; a future importer tomorrow). They mirror
 * the field rules + money math of the interactive verbs
 * (organizations/_actions/save-organization.ts, sales-orders/_actions/
 * save-so.ts + manage-so-lines.ts) — kept in lockstep by hand; if those rules
 * change, change them here too.
 *
 * Everything lands in `draft` status. Numbers allocate via
 * next_document_number, same as the interactive path. Server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DraftWriteResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Create a draft customer organization. Segment is required by the schema. */
export async function insertDraftOrganization(
  supabase: SupabaseClient,
  input: {
    legalName: string;
    customerSegmentId: string;
    preferredLanguage: "da" | "en";
  },
): Promise<DraftWriteResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      legal_name: input.legalName,
      customer_segment_id: input.customerSegmentId,
      preferred_language: input.preferredLanguage,
      lifecycle_stage: "customer",
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }
  return { ok: true, id: data.id };
}

/**
 * Create a draft sales order with a SINGLE bike-template line (the VC-1 voice
 * shape). unitPrice falls back to the template's default retail price, else 0.
 * VAT defaults to the customer's default_vat_code. Money is computed here the
 * same way addSOLine does it, then the header totals are recomputed.
 */
export async function insertDraftSalesOrder(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    language: "da" | "en";
    currency: string;
    orderDate: string; // ISO date
    deliveryDate: string | null;
    deliveryPrecision: "exact" | "week" | null;
    productionNote: string | null;
    line: {
      quantity: number;
      templateId: string;
      colorId: string | null;
      unitPrice: number | null;
    };
  },
): Promise<DraftWriteResult<{ id: string; number: string }>> {
  // Customer default VAT (optional) → resolve its rate.
  const { data: org } = await supabase
    .from("organizations")
    .select("default_vat_code")
    .eq("id", input.organizationId)
    .maybeSingle();
  const vatCode = (org?.default_vat_code as string | null) ?? null;
  let vatRate = 0;
  if (vatCode) {
    const { data: vc } = await supabase
      .from("vat_codes")
      .select("default_rate")
      .eq("code", vatCode)
      .maybeSingle();
    vatRate = Number(vc?.default_rate ?? 0);
  }

  // unitPrice fallback: the template's default retail price — but ONLY when
  // its currency matches the order's, since the price is a bare number in the
  // template's own currency (default DKK). Applying a DKK figure verbatim to a
  // EUR order would be wrong money, so fall back to 0 (reviewer sets it).
  let unitPrice = input.line.unitPrice;
  if (unitPrice == null) {
    const { data: tpl } = await supabase
      .from("bike_templates")
      .select("default_retail_price, default_retail_currency")
      .eq("id", input.line.templateId)
      .maybeSingle();
    const tplCurrency = (
      (tpl?.default_retail_currency as string | null) ?? "DKK"
    ).toUpperCase();
    unitPrice =
      tplCurrency === input.currency.toUpperCase()
        ? Number(tpl?.default_retail_price ?? 0)
        : 0;
  }

  const { data: number, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "sales_order" },
  );
  if (numErr || typeof number !== "string") {
    return { ok: false, error: numErr?.message ?? "could not allocate SO number" };
  }

  const { data: so, error: soErr } = await supabase
    .from("sales_orders")
    .insert({
      sales_order_number: number,
      status: "draft",
      organization_id: input.organizationId,
      language: input.language,
      order_date: input.orderDate,
      requested_delivery_date: input.deliveryDate,
      requested_delivery_precision: input.deliveryDate
        ? (input.deliveryPrecision ?? "exact")
        : null,
      currency: input.currency,
      production_note: input.productionNote,
    })
    .select("id")
    .single();
  if (soErr || !so) {
    return { ok: false, error: soErr?.message ?? "could not create sales order" };
  }

  const round = (n: number) => Math.round(n * 10000) / 10000;
  const lineSubtotal = input.line.quantity * unitPrice;
  const lineVat = lineSubtotal * (vatRate / 100);
  const lineTotal = lineSubtotal + lineVat;

  const { error: lineErr } = await supabase.from("sales_order_lines").insert({
    sales_order_id: so.id,
    line_number: 1,
    bike_template_id: input.line.templateId,
    quantity: input.line.quantity,
    unit_price: unitPrice,
    vat_code: vatCode,
    vat_rate: vatRate,
    color_id: input.line.colorId,
    line_subtotal: round(lineSubtotal),
    line_vat_amount: round(lineVat),
    line_total: round(lineTotal),
  });
  if (lineErr) {
    // Line failed after the header was written. Roll the header back (same
    // row-first/delete-on-failure pattern as upload-voicemail) so a retry
    // doesn't pile up orphan zero-total headers + burn a new number each time.
    // The document number is already consumed — a harmless gap.
    await supabase.from("sales_orders").delete().eq("id", so.id);
    return { ok: false, error: `sales order line failed: ${lineErr.message}` };
  }

  await supabase
    .from("sales_orders")
    .update({
      subtotal_amount: round(lineSubtotal),
      total_vat_amount: round(lineVat),
      total_amount: round(lineTotal),
      updated_at: new Date().toISOString(),
    })
    .eq("id", so.id);

  return { ok: true, id: so.id, number };
}
