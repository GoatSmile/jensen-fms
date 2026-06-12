"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/invoicing/status";

export type CreateCreditNoteResult = { ok: false; error: string };

/**
 * Draft a full-reversal credit note for an issued (or overdue/paid)
 * invoice: every line mirrored with negated quantity and totals, periods
 * and agreement links copied for traceability. The original is NOT
 * touched yet — it flips to `credited` (and its WOs are released) when
 * the credit note is ISSUED, because until then the draft can still be
 * cancelled. At issue the note gets its own CRE-2026-xxxx number series.
 *
 * Partial credits are out of scope (v1) — the partial unique index in
 * migration 37 enforces at most one live credit note per invoice.
 */
export async function createCreditNote(
  invoiceId: string,
): Promise<CreateCreditNoteResult> {
  if (!invoiceId) return { ok: false, error: "Missing invoice id." };

  const supabase = await createClient();

  const [invoiceRes, linesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `id, invoice_number, status, organization_id, language, currency,
         sales_order_id, credited_invoice_id,
         subtotal_amount, total_vat_amount, total_amount`,
      )
      .eq("id", invoiceId)
      .maybeSingle(),
    supabase
      .from("invoice_lines")
      .select(
        `line_number, part_id, bike_template_id, color_id,
         description_en, description_da, quantity, unit_price,
         vat_code, vat_rate, line_subtotal, line_vat_amount, line_total,
         service_agreement_id, billing_period_start, billing_period_end`,
      )
      .eq("invoice_id", invoiceId)
      .order("line_number", { ascending: true }),
  ]);

  const invoice = invoiceRes.data;
  if (invoiceRes.error || !invoice) {
    return {
      ok: false,
      error: `Could not load invoice: ${invoiceRes.error?.message ?? "not found"}`,
    };
  }
  if (invoice.credited_invoice_id) {
    return { ok: false, error: "This is already a credit note." };
  }
  if (!["issued", "overdue", "paid"].includes(invoice.status as string)) {
    return {
      ok: false,
      error: "Only issued invoices can be credited — cancel drafts instead.",
    };
  }

  const { data: existing } = await supabase
    .from("invoices")
    .select("id, invoice_number")
    .eq("credited_invoice_id", invoiceId)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: `A credit note already exists for this invoice (${existing.invoice_number}).`,
    };
  }

  const { data: creditNote, error: cnErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number: `DRAFT-${crypto.randomUUID().slice(0, 8)}`,
      organization_id: invoice.organization_id,
      sales_order_id: invoice.sales_order_id,
      credited_invoice_id: invoice.id,
      language: invoice.language ?? "da",
      status: "draft",
      currency: invoice.currency ?? "DKK",
      subtotal_amount: round2(-Number(invoice.subtotal_amount)),
      total_vat_amount: round2(-Number(invoice.total_vat_amount)),
      total_amount: round2(-Number(invoice.total_amount)),
      notes: `Credit note for ${invoice.invoice_number}.`,
    })
    .select("id")
    .single();
  if (cnErr || !creditNote) {
    return {
      ok: false,
      error: `Could not create credit note: ${cnErr?.message ?? "unknown error"}`,
    };
  }

  const mirrored = (linesRes.data ?? []).map((l) => ({
    invoice_id: creditNote.id,
    line_number: l.line_number,
    part_id: l.part_id,
    bike_template_id: l.bike_template_id,
    color_id: l.color_id,
    description_en: l.description_en,
    description_da: l.description_da,
    quantity: -Number(l.quantity),
    unit_price: Number(l.unit_price),
    vat_code: l.vat_code,
    vat_rate: l.vat_rate,
    line_subtotal: round2(-Number(l.line_subtotal)),
    line_vat_amount: round2(-Number(l.line_vat_amount)),
    line_total: round2(-Number(l.line_total)),
    service_agreement_id: l.service_agreement_id,
    billing_period_start: l.billing_period_start,
    billing_period_end: l.billing_period_end,
  }));
  if (mirrored.length > 0) {
    const { error: linesErr } = await supabase
      .from("invoice_lines")
      .insert(mirrored);
    if (linesErr) {
      await supabase.from("invoices").delete().eq("id", creditNote.id);
      return {
        ok: false,
        error: `Could not mirror invoice lines: ${linesErr.message}`,
      };
    }
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${creditNote.id}`);
}
