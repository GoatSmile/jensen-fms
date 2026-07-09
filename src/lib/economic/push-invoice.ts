/**
 * Push one issued FMS invoice to e-conomic as a DRAFT journal voucher
 * (manualCustomerInvoice entries — debit customer, contra revenue + VAT).
 * The bookkeeper reviews and books it inside e-conomic; the FMS never
 * books directly. See migrations/60_economic_settings.sql for the design.
 *
 * Idempotent: an invoice with economic_voucher_id set is skipped. The
 * customer is auto-created in e-conomic on first push (number assigned by
 * e-conomic, stored on organizations.economic_customer_number).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { round2 } from "@/lib/invoicing/status";

import { economicFetch } from "./client";
import { economicConfigGaps, loadEconomicSettings } from "./settings";

type PushResult = { ok: true; voucherId: string } | { ok: false; error: string };

type AccountingYear = {
  year: string;
  fromDate: string;
  toDate: string;
};

type CreatedCustomer = { customerNumber: number };

type CreatedVoucher = {
  accountingYear?: { year?: string };
  voucherNumber?: number;
  journalNumber?: number;
};

const PUSHABLE_STATUSES = ["issued", "paid", "overdue", "credited"];

export async function pushInvoiceToEconomic(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<PushResult> {
  const settings = await loadEconomicSettings(supabase);
  const gaps = economicConfigGaps(settings);
  if (gaps.length > 0) {
    return {
      ok: false,
      error: `e-conomic is not ready: ${gaps.join(", ")}. Fill the Accounting section under Admin → Settings.`,
    };
  }

  const [invoiceRes, linesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `
          id, invoice_number, kind, status, currency, issued_date, due_date,
          credited_invoice_id, economic_voucher_id,
          organization:organizations!organization_id(
            id, legal_name, display_name_da, display_name_en, cvr_number,
            ean_number, email, address_line1, address_line2, city, zip_code,
            billing_currency, economic_customer_number
          )
        `,
      )
      .eq("id", invoiceId)
      .maybeSingle(),
    supabase
      .from("invoice_lines")
      .select("vat_rate, line_total")
      .eq("invoice_id", invoiceId),
  ]);

  const invoice = invoiceRes.data;
  if (invoiceRes.error || !invoice) {
    return { ok: false, error: "Invoice not found." };
  }
  if (invoice.economic_voucher_id) {
    return { ok: false, error: "Already pushed to e-conomic." };
  }
  if (!PUSHABLE_STATUSES.includes(invoice.status as string)) {
    return {
      ok: false,
      error: "Only issued invoices can be pushed — issue it first.",
    };
  }
  if (!invoice.issued_date) {
    return { ok: false, error: "Invoice has no issued date." };
  }
  const org = Array.isArray(invoice.organization)
    ? invoice.organization[0]
    : invoice.organization;
  if (!org) {
    return { ok: false, error: "Invoice has no customer organization." };
  }

  const lines = linesRes.data ?? [];
  if (lines.length === 0) {
    return { ok: false, error: "Invoice has no lines." };
  }

  // 1. Ensure the e-conomic customer exists.
  let customerNumber = org.economic_customer_number as number | null;
  if (customerNumber == null) {
    const orgName =
      (org.display_name_da as string | null) ??
      (org.display_name_en as string | null) ??
      (org.legal_name as string);
    const created = await economicFetch<CreatedCustomer>("/customers", {
      method: "POST",
      body: {
        name: orgName,
        currency:
          (org.billing_currency as string | null)?.trim() ||
          (invoice.currency as string | null)?.trim() ||
          "DKK",
        customerGroup: { customerGroupNumber: settings.customerGroup },
        vatZone: { vatZoneNumber: settings.vatZone },
        paymentTerms: { paymentTermsNumber: settings.paymentTerms },
        ...(org.cvr_number
          ? { corporateIdentificationNumber: String(org.cvr_number) }
          : {}),
        ...(org.ean_number ? { ean: String(org.ean_number) } : {}),
        ...(org.email ? { email: String(org.email) } : {}),
        ...(org.address_line1
          ? {
              address: [org.address_line1, org.address_line2]
                .filter(Boolean)
                .join(", "),
            }
          : {}),
        ...(org.zip_code ? { zip: String(org.zip_code) } : {}),
        ...(org.city ? { city: String(org.city) } : {}),
      },
    });
    if (!created.ok) {
      return {
        ok: false,
        error: `Could not create the customer in e-conomic: ${created.error}`,
      };
    }
    customerNumber = created.data.customerNumber;
    const saved = await supabase
      .from("organizations")
      .update({ economic_customer_number: customerNumber })
      .eq("id", org.id);
    if (saved.error) {
      // The customer now exists remotely but the mapping failed to save —
      // surface loudly instead of risking a duplicate on retry.
      return {
        ok: false,
        error: `Customer #${customerNumber} was created in e-conomic but saving the mapping failed: ${saved.error.message}. Set organizations.economic_customer_number manually before retrying.`,
      };
    }
  }

  // 2. Resolve the accounting year covering the issue date (fiscal years
  // may straddle calendar years, so never assume "2026").
  const yearsRes = await economicFetch<{ collection: AccountingYear[] }>(
    "/accounting-years?pagesize=50",
  );
  if (!yearsRes.ok) {
    return {
      ok: false,
      error: `Could not read accounting years: ${yearsRes.error}`,
    };
  }
  const issuedDate = invoice.issued_date as string;
  const accountingYear = yearsRes.data.collection.find(
    (y) => y.fromDate <= issuedDate && issuedDate <= y.toDate,
  );
  if (!accountingYear) {
    return {
      ok: false,
      error: `No open e-conomic accounting year covers ${issuedDate} — create it in e-conomic first.`,
    };
  }

  // 3. One entry per distinct VAT rate (gross amount debits the customer;
  // zero-rated groups — export / reverse charge — carry no VAT code).
  const byRate = new Map<number, { gross: number }>();
  for (const l of lines) {
    const rate = Number(l.vat_rate ?? 0);
    const acc = byRate.get(rate) ?? { gross: 0 };
    acc.gross += Number(l.line_total ?? 0);
    byRate.set(rate, acc);
  }

  const isCreditNote = Boolean(invoice.credited_invoice_id);
  const orgName =
    (org.display_name_da as string | null) ??
    (org.display_name_en as string | null) ??
    (org.legal_name as string);
  // e-conomic's customerInvoice field is an integer — derive one from the
  // digits of "INV-2026-0007" (→ 20260007). Credit notes omit it (their
  // CRE series would collide with the INV integer space).
  const invoiceInt = isCreditNote
    ? null
    : Number((invoice.invoice_number as string).replace(/\D/g, "")) || null;

  const entries = [...byRate.entries()]
    .filter(([, v]) => v.gross !== 0)
    .map(([rate, v]) => ({
      customer: { customerNumber },
      amount: round2(v.gross),
      currency: { code: (invoice.currency as string | null)?.trim() || "DKK" },
      date: issuedDate,
      ...(invoice.due_date ? { dueDate: invoice.due_date } : {}),
      text: `${invoice.invoice_number} — ${orgName}${isCreditNote ? " (kreditnota)" : ""}`,
      contraAccount: { accountNumber: settings.revenueAccount },
      // VAT amount is deliberately NOT passed — e-conomic derives it from
      // the code, avoiding sign-convention bugs; an øre-level rounding
      // difference shows up in the draft voucher for the bookkeeper.
      ...(rate > 0 ? { contraVatAccount: { vatCode: settings.vatCode } } : {}),
      ...(invoiceInt ? { customerInvoice: invoiceInt } : {}),
    }));
  if (entries.length === 0) {
    return { ok: false, error: "Invoice total is zero — nothing to push." };
  }

  const voucherRes = await economicFetch<CreatedVoucher[] | CreatedVoucher>(
    `/journals/${settings.journalNumber}/vouchers`,
    {
      method: "POST",
      body: {
        accountingYear: { year: accountingYear.year },
        entries: { manualCustomerInvoices: entries },
      },
    },
  );
  if (!voucherRes.ok) {
    return {
      ok: false,
      error: `e-conomic rejected the voucher: ${voucherRes.error}`,
    };
  }
  const voucher = Array.isArray(voucherRes.data)
    ? voucherRes.data[0]
    : voucherRes.data;
  const voucherId = `${voucher?.accountingYear?.year ?? accountingYear.year} J${settings.journalNumber} V${voucher?.voucherNumber ?? "?"}`;

  const stamped = await supabase
    .from("invoices")
    .update({
      economic_voucher_id: voucherId,
      economic_synced_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);
  if (stamped.error) {
    return {
      ok: false,
      error: `Voucher ${voucherId} was created in e-conomic but stamping the invoice failed: ${stamped.error.message}. Set invoices.economic_voucher_id manually to avoid a duplicate push.`,
    };
  }

  return { ok: true, voucherId };
}
