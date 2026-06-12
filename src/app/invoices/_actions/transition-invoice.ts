"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PAYMENT_TERMS_DAYS,
  validNextInvoiceStatuses,
  type InvoiceStatus,
} from "@/lib/invoicing/status";

export type InvoiceTransitionResult = { ok: true } | { ok: false; error: string };

/**
 * Issue a draft invoice: allocate the sequential INV number (drafts carry a
 * DRAFT-xxxx placeholder so abandoned drafts never burn a number), stamp
 * issued_date + issued_locked_at, set the due date from the customer's
 * payment terms (net DEFAULT_PAYMENT_TERMS_DAYS when the org has none),
 * and snapshot the org's EAN number into ean_number_used — public-sector
 * customers bill via EAN and the number used must survive later org edits.
 * Issuing is the lock — after this the invoice is immutable bookkeeping
 * material.
 */
export async function issueInvoice(
  invoiceId: string,
): Promise<InvoiceTransitionResult> {
  if (!invoiceId) return { ok: false, error: "Missing invoice id." };

  const supabase = await createClient();
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      `id, status, due_date, credited_invoice_id,
       organization:organizations!organization_id(ean_number, payment_terms_days)`,
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr || !invoice) {
    return {
      ok: false,
      error: `Could not load invoice: ${invErr?.message ?? "not found"}`,
    };
  }
  if (invoice.status !== "draft") {
    return { ok: false, error: "Only draft invoices can be issued." };
  }
  const isCreditNote = invoice.credited_invoice_id != null;
  const org = Array.isArray(invoice.organization)
    ? invoice.organization[0]
    : invoice.organization;

  const { count: lineCount } = await supabase
    .from("invoice_lines")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);
  if ((lineCount ?? 0) === 0) {
    return { ok: false, error: "Cannot issue an invoice with no lines." };
  }

  // Credit notes draw from their own sequential series (CRE-yyyy-xxxx) —
  // OIOUBL treats CreditNote as a distinct document type and the issued
  // INV series must stay gapless.
  const { data: invoiceNumber, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: isCreditNote ? "credit_note" : "invoice" },
  );
  if (numErr || typeof invoiceNumber !== "string") {
    return {
      ok: false,
      error: `Could not allocate invoice number: ${numErr?.message ?? "unknown error"}`,
    };
  }

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const termsDays = Number(org?.payment_terms_days) || DEFAULT_PAYMENT_TERMS_DAYS;
  const due = new Date();
  due.setDate(due.getDate() + termsDays);

  const { error: updErr } = await supabase
    .from("invoices")
    .update({
      invoice_number: invoiceNumber,
      status: "issued",
      issued_date: today,
      // A credit note isn't payable — its due date is its issue date.
      due_date: isCreditNote
        ? today
        : (invoice.due_date ?? due.toISOString().slice(0, 10)),
      issued_locked_at: nowIso,
      ean_number_used: org?.ean_number ?? null,
    })
    .eq("id", invoiceId)
    .eq("status", "draft");
  if (updErr) {
    return { ok: false, error: `Could not issue invoice: ${updErr.message}` };
  }

  // Issuing a credit note settles the original: status → credited, and
  // its work orders go back to the uninvoiced pool (the work itself is
  // still billable — the document covering it just got reversed).
  if (isCreditNote && invoice.credited_invoice_id) {
    await supabase
      .from("invoices")
      .update({ status: "credited" })
      .eq("id", invoice.credited_invoice_id)
      .in("status", ["issued", "overdue", "paid"]);
    await supabase
      .from("work_orders")
      .update({ invoice_id: null, updated_at: nowIso })
      .eq("invoice_id", invoice.credited_invoice_id);
    revalidatePath(`/invoices/${invoice.credited_invoice_id}`);
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

/** Mark an issued (or overdue) invoice as paid today. */
export async function markInvoicePaid(
  invoiceId: string,
): Promise<InvoiceTransitionResult> {
  return transition(invoiceId, "paid", (inv) => ({
    paid_date: inv.paid_date ?? new Date().toISOString().slice(0, 10),
  }));
}

/**
 * Cancel a draft invoice and release its work orders back to the
 * uninvoiced list. Issued invoices are never cancelled — that's a credit
 * note (later slice).
 */
export async function cancelDraftInvoice(
  invoiceId: string,
): Promise<InvoiceTransitionResult> {
  const result = await transition(invoiceId, "cancelled", () => ({}));
  if (!result.ok) return result;

  const supabase = await createClient();
  await supabase
    .from("work_orders")
    .update({ invoice_id: null, updated_at: new Date().toISOString() })
    .eq("invoice_id", invoiceId);

  revalidatePath("/invoices");
  return { ok: true };
}

async function transition(
  invoiceId: string,
  toStatus: InvoiceStatus,
  patch: (invoice: {
    status: InvoiceStatus;
    paid_date: string | null;
  }) => Record<string, unknown>,
): Promise<InvoiceTransitionResult> {
  if (!invoiceId) return { ok: false, error: "Missing invoice id." };

  const supabase = await createClient();
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, status, paid_date")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr || !invoice) {
    return {
      ok: false,
      error: `Could not load invoice: ${invErr?.message ?? "not found"}`,
    };
  }

  const from = invoice.status as InvoiceStatus;
  if (!validNextInvoiceStatuses(from).includes(toStatus)) {
    return { ok: false, error: `Cannot move from "${from}" to "${toStatus}".` };
  }

  const { error: updErr } = await supabase
    .from("invoices")
    .update({ status: toStatus, ...patch({ status: from, paid_date: invoice.paid_date }) })
    .eq("id", invoiceId)
    .eq("status", from);
  if (updErr) {
    return { ok: false, error: `Could not update invoice: ${updErr.message}` };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}
