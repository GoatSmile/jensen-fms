/**
 * Pure draft writers — create draft customers / sales orders from TYPED args,
 * with no FormData parsing and no redirect(), so they compose from any caller
 * (the voice-command apply path today; a future importer tomorrow). They mirror
 * the field rules + money math of the interactive verbs
 * (organizations/_actions/save-organization.ts, sales-orders/_actions/save-so.ts)
 * for the HEADER fields, which are still mirrored by hand.
 *
 * The LINE is no longer mirrored: it goes through `insertLine`, the same writer
 * the interactive dialog uses, so the money maths, the line numbering and the
 * parent-total recompute exist once. That was the whole point of the shared
 * commercial-lines layer, and this file was the one caller left outside it.
 *
 * Everything lands in `draft` status. Numbers allocate via
 * next_document_number, same as the interactive path. Server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

import type { Database } from "@/lib/types/database";
import { retailPriceIn } from "@/lib/commercial/lines";
import { SALES_ORDER_DOC, insertLine } from "@/lib/commercial/write-lines";

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
 * shape). unitPrice falls back to the template's list price via the shared
 * `retailPriceIn` — currency-guarded, so a DKK template on a EUR order yields
 * nothing rather than wrong money — else 0, for the reviewer to set. VAT
 * defaults to the customer's default_vat_code; `insertLine` resolves its rate,
 * writes the line and recomputes the header totals.
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
  // The rate is NOT resolved here — insertLine does it, from this code.
  const vatCode = (org?.default_vat_code as string | null) ?? null;

  // unitPrice fallback: the template's list price, through the same
  // currency-guarded helper the interactive dialog uses. A DKK-priced template
  // on a EUR order yields null there, and 0 here, for the reviewer to set.
  let unitPrice = input.line.unitPrice;
  if (unitPrice == null) {
    const { data: tpl } = await supabase
      .from("bike_templates")
      .select("default_retail_price, default_retail_currency")
      .eq("id", input.line.templateId)
      .maybeSingle();
    unitPrice =
      retailPriceIn(
        tpl as {
          default_retail_price: number | null;
          default_retail_currency: string | null;
        } | null,
        input.currency,
      ) ?? 0;
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

  // The shared writer: VAT rate, line number, money and the header-total
  // recompute all happen in there, once, for both documents.
  const t = await getTranslations("errors");
  const lineResult = await insertLine(
    supabase as unknown as SupabaseClient<Database>,
    SALES_ORDER_DOC,
    so.id,
    {
      kind: "template",
      part_id: null,
      bike_template_id: input.line.templateId,
      quantity: input.line.quantity,
      unit_price: unitPrice,
      vat_code: vatCode,
      color_id: input.line.colorId,
      description_en: null,
      description_da: null,
    },
    t,
  );
  if (!lineResult.ok) {
    // Line failed after the header was written. Roll the header back (same
    // row-first/delete-on-failure pattern as upload-voicemail) so a retry
    // doesn't pile up orphan zero-total headers + burn a new number each time.
    // The document number is already consumed — a harmless gap.
    await supabase.from("sales_orders").delete().eq("id", so.id);
    return { ok: false, error: `sales order line failed: ${lineResult.error}` };
  }

  return { ok: true, id: so.id, number };
}
