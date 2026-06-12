"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/invoicing/status";

export type CreateInvoiceResult = { ok: false; error: string };

/**
 * Draft an invoice from a completed billable work order: one line per
 * consumed part at the WO's retail price snapshot, plus a labor line
 * (minutes × rate). Buckets the linked service agreement covers
 * (covers_parts / covers_labor) are omitted and noted on the invoice.
 *
 * The draft gets a DRAFT-xxxx placeholder number — the sequential INV
 * number is allocated at issue (Danish bookkeeping wants issued numbers
 * gapless; abandoned drafts shouldn't burn one). VAT is snapshotted per
 * line from the DK_STANDARD code at draft time.
 *
 * On success redirects to the new invoice; the WO is linked via
 * work_orders.invoice_id so it drops off the uninvoiced list.
 */
export async function createInvoiceFromWO(
  woId: string,
): Promise<CreateInvoiceResult> {
  if (!woId) return { ok: false, error: "Missing work order id." };

  const supabase = await createClient();

  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select(
      `
        id, wo_number, status, is_billable, invoice_id, language,
        labor_minutes, labor_rate_dkk, customer_summary_en, customer_summary_da,
        agreement:service_agreements!covered_by_service_agreement_id(covers_parts, covers_labor),
        bike:bikes!bike_id(
          id, frame_number, owner_organization_id
        ),
        parts:work_order_parts(
          quantity, unit_price,
          part:parts!part_id(internal_sku, name_en, name_da)
        )
      `,
    )
    .eq("id", woId)
    .maybeSingle();
  if (woErr || !wo) {
    return {
      ok: false,
      error: `Could not load work order: ${woErr?.message ?? "not found"}`,
    };
  }

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;
  const agreement = one(wo.agreement);
  const bike = one(wo.bike);

  if (wo.status !== "completed") {
    return { ok: false, error: "Only completed work orders can be invoiced." };
  }
  if (!wo.is_billable) {
    return {
      ok: false,
      error: "This work order is covered by a service agreement — nothing to bill.",
    };
  }
  if (wo.invoice_id) {
    return { ok: false, error: "This work order is already on an invoice." };
  }
  if (!bike?.owner_organization_id) {
    return {
      ok: false,
      error:
        "The bike has no owner organization — assign the bike to a customer first.",
    };
  }

  // VAT snapshot: Danish standard rate at draft time.
  const { data: vat, error: vatErr } = await supabase
    .from("vat_codes")
    .select("code, default_rate")
    .eq("code", "DK_STANDARD")
    .eq("is_active", true)
    .maybeSingle();
  if (vatErr || !vat) {
    return {
      ok: false,
      error: "VAT code DK_STANDARD is missing or archived — check /admin.",
    };
  }
  const vatRate = Number(vat.default_rate);

  const coversParts = agreement?.covers_parts === true;
  const coversLabor = agreement?.covers_labor === true;

  type LineDraft = {
    description_en: string;
    description_da: string;
    quantity: number;
    unit_price: number;
  };
  const lines: LineDraft[] = [];

  if (!coversParts) {
    for (const row of wo.parts ?? []) {
      const part = one(row.part);
      const qty = Number(row.quantity ?? 0);
      if (qty <= 0) continue;
      const sku = part?.internal_sku ? ` (${part.internal_sku})` : "";
      lines.push({
        description_en: `${part?.name_en ?? "Part"}${sku}`,
        description_da: `${part?.name_da ?? part?.name_en ?? "Reservedel"}${sku}`,
        quantity: qty,
        unit_price: round2(Number(row.unit_price ?? 0)),
      });
    }
  }

  const laborMinutes = Number(wo.labor_minutes ?? 0);
  const laborRate = Number(wo.labor_rate_dkk ?? 0);
  if (!coversLabor && laborMinutes > 0 && laborRate > 0) {
    lines.push({
      description_en: `Labor — ${laborMinutes} min at ${laborRate} kr./h`,
      description_da: `Arbejdsløn — ${laborMinutes} min a ${laborRate} kr./t`,
      quantity: 1,
      unit_price: round2((laborMinutes / 60) * laborRate),
    });
  }

  if (lines.length === 0) {
    return {
      ok: false,
      error:
        "Nothing to bill — no billable parts or labor on this work order.",
    };
  }

  let subtotal = 0;
  let totalVat = 0;
  const lineRows = lines.map((l, i) => {
    const lineSubtotal = round2(l.quantity * l.unit_price);
    const lineVat = round2(lineSubtotal * (vatRate / 100));
    subtotal = round2(subtotal + lineSubtotal);
    totalVat = round2(totalVat + lineVat);
    return {
      line_number: i + 1,
      description_en: l.description_en,
      description_da: l.description_da,
      quantity: l.quantity,
      unit_price: l.unit_price,
      vat_code: vat.code,
      vat_rate: vatRate,
      line_subtotal: lineSubtotal,
      line_vat_amount: lineVat,
      line_total: round2(lineSubtotal + lineVat),
    };
  });

  const coverageNotes = [
    coversParts ? "Parts covered by service agreement — not billed." : null,
    coversLabor ? "Labor covered by service agreement — not billed." : null,
  ].filter(Boolean);
  const frame = bike.frame_number ? ` (${bike.frame_number})` : "";

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number: `DRAFT-${crypto.randomUUID().slice(0, 8)}`,
      organization_id: bike.owner_organization_id,
      language: wo.language ?? "da",
      status: "draft",
      currency: "DKK",
      subtotal_amount: subtotal,
      total_vat_amount: totalVat,
      total_amount: round2(subtotal + totalVat),
      notes: [`Drafted from ${wo.wo_number}${frame}.`, ...coverageNotes].join(" "),
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
    // Leave no half-invoice behind — the draft without lines is junk.
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return {
      ok: false,
      error: `Could not write invoice lines: ${linesErr.message}`,
    };
  }

  const { error: linkErr } = await supabase
    .from("work_orders")
    .update({ invoice_id: invoice.id, updated_at: new Date().toISOString() })
    .eq("id", woId);
  if (linkErr) {
    return {
      ok: false,
      error: `Invoice created but linking the work order failed: ${linkErr.message}`,
    };
  }

  revalidatePath("/invoices");
  revalidatePath(`/maintenance/work-orders/${woId}`);
  redirect(`/invoices/${invoice.id}`);
}
