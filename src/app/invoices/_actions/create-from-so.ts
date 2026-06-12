"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/invoicing/status";

export type CreateInvoiceFromSOResult = { ok: false; error: string };

/**
 * Draft an invoice from a delivered sales order. Lines copy 1:1 from
 * sales_order_lines (bilingual descriptions, per-line VAT snapshot —
 * falling back to DK_STANDARD when an SO line predates VAT capture).
 * For bike-template lines, the frame numbers of the bikes built under
 * the line's linked MOs are appended to the description — the customer
 * sees exactly which bikes they're paying for.
 *
 * Same draft contract as invoice-from-WO: DRAFT-xxxx placeholder number,
 * the sequential INV number lands at issue.
 */
export async function createInvoiceFromSO(
  soId: string,
): Promise<CreateInvoiceFromSOResult> {
  if (!soId) return { ok: false, error: "Missing sales order id." };

  const supabase = await createClient();

  const { data: so, error: soErr } = await supabase
    .from("sales_orders")
    .select(
      `
        id, sales_order_number, status, organization_id, language, currency,
        lines:sales_order_lines(
          id, line_number, description_en, description_da, quantity,
          unit_price, vat_code, vat_rate, bike_template_id,
          template:bike_templates!bike_template_id(name_en, name_da),
          part:parts!part_id(name_en, name_da, internal_sku),
          color:colors!color_id(name_en, name_da)
        )
      `,
    )
    .eq("id", soId)
    .maybeSingle();
  if (soErr || !so) {
    return {
      ok: false,
      error: `Could not load sales order: ${soErr?.message ?? "not found"}`,
    };
  }
  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  if (so.status !== "delivered") {
    return { ok: false, error: "Only delivered sales orders can be invoiced." };
  }
  if (!so.organization_id) {
    return { ok: false, error: "The sales order has no customer organization." };
  }

  const { data: existing } = await supabase
    .from("invoices")
    .select("id, invoice_number")
    .eq("sales_order_id", soId)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: `An invoice already exists for this SO (${existing.invoice_number}).`,
    };
  }

  const soLines = (so.lines ?? []).filter((l) => Number(l.quantity) > 0);
  if (soLines.length === 0) {
    return { ok: false, error: "The sales order has no lines to invoice." };
  }

  // Fallback VAT for lines that predate per-line VAT capture on SOs.
  const { data: vat } = await supabase
    .from("vat_codes")
    .select("code, default_rate")
    .eq("code", "DK_STANDARD")
    .eq("is_active", true)
    .maybeSingle();

  // Frame numbers per SO line: bikes created under MOs linked to the line.
  const lineIds = soLines.map((l) => l.id);
  const { data: mos } = await supabase
    .from("manufacturing_orders")
    .select("id, sales_order_line_id")
    .in("sales_order_line_id", lineIds)
    .neq("status", "cancelled");
  const moIds = (mos ?? []).map((m) => m.id);
  const framesByLine = new Map<string, string[]>();
  if (moIds.length > 0) {
    const { data: bikes } = await supabase
      .from("bikes")
      .select("frame_number, manufacturing_order_id")
      .in("manufacturing_order_id", moIds)
      .is("deleted_at", null)
      .order("frame_number", { ascending: true });
    const lineByMo = new Map(
      (mos ?? []).map((m) => [m.id, m.sales_order_line_id as string]),
    );
    for (const bike of bikes ?? []) {
      if (!bike.manufacturing_order_id) continue;
      const lineId = lineByMo.get(bike.manufacturing_order_id);
      if (!lineId || !bike.frame_number) continue;
      const list = framesByLine.get(lineId) ?? [];
      list.push(bike.frame_number);
      framesByLine.set(lineId, list);
    }
  }

  let subtotal = 0;
  let totalVat = 0;
  const lineRows = soLines
    .sort((a, b) => a.line_number - b.line_number)
    .map((l, i) => {
      const vatCode = l.vat_code ?? vat?.code ?? "DK_STANDARD";
      const vatRate = Number(l.vat_rate ?? vat?.default_rate ?? 25);
      const quantity = Number(l.quantity);
      const unitPrice = round2(Number(l.unit_price));
      const lineSubtotal = round2(quantity * unitPrice);
      const lineVat = round2(lineSubtotal * (vatRate / 100));
      subtotal = round2(subtotal + lineSubtotal);
      totalVat = round2(totalVat + lineVat);

      const frames = l.bike_template_id ? (framesByLine.get(l.id) ?? []) : [];
      const frameSuffixEn =
        frames.length > 0 ? ` — frames: ${frames.join(", ")}` : "";
      const frameSuffixDa =
        frames.length > 0 ? ` — stelnumre: ${frames.join(", ")}` : "";

      // SO lines often have no stored description — fall back to what the
      // line points at: template + colour, or part name + SKU.
      const tpl = one(l.template);
      const part = one(l.part);
      const color = one(l.color);
      const fallbackEn = tpl
        ? [tpl.name_en ?? tpl.name_da, color?.name_en].filter(Boolean).join(", ")
        : part
          ? `${part.name_en ?? part.name_da}${part.internal_sku ? ` (${part.internal_sku})` : ""}`
          : "Line";
      const fallbackDa = tpl
        ? [tpl.name_da ?? tpl.name_en, color?.name_da ?? color?.name_en]
            .filter(Boolean)
            .join(", ")
        : part
          ? `${part.name_da ?? part.name_en}${part.internal_sku ? ` (${part.internal_sku})` : ""}`
          : "Linje";

      return {
        line_number: i + 1,
        bike_template_id: l.bike_template_id,
        description_en: `${l.description_en ?? l.description_da ?? fallbackEn}${frameSuffixEn}`,
        description_da: `${l.description_da ?? l.description_en ?? fallbackDa}${frameSuffixDa}`,
        quantity,
        unit_price: unitPrice,
        vat_code: vatCode,
        vat_rate: vatRate,
        line_subtotal: lineSubtotal,
        line_vat_amount: lineVat,
        line_total: round2(lineSubtotal + lineVat),
      };
    });

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number: `DRAFT-${crypto.randomUUID().slice(0, 8)}`,
      sales_order_id: soId,
      organization_id: so.organization_id,
      language: so.language ?? "da",
      status: "draft",
      currency: (so.currency as string | null)?.trim() || "DKK",
      subtotal_amount: subtotal,
      total_vat_amount: totalVat,
      total_amount: round2(subtotal + totalVat),
      notes: `Drafted from ${so.sales_order_number}.`,
    })
    .select("id")
    .single();
  if (invErr || !invoice) {
    return {
      ok: false,
      error: `Could not create invoice: ${invErr?.message ?? "unknown error"}`,
    };
  }

  const { error: linesErr } = await supabase
    .from("invoice_lines")
    .insert(lineRows.map((l) => ({ ...l, invoice_id: invoice.id })));
  if (linesErr) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return {
      ok: false,
      error: `Could not write invoice lines: ${linesErr.message}`,
    };
  }

  revalidatePath("/invoices");
  revalidatePath(`/sales-orders/${soId}`);
  redirect(`/invoices/${invoice.id}`);
}
