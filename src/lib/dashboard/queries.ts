/**
 * Dashboard data loaders — the "money and commitments" band plus the
 * 12-month trend series (RPC `dashboard_monthly_stats`, migration 58).
 *
 * Design rule for the band: a card that has nothing to report is NOT
 * rendered (an empty card is the busiest kind of empty), so every loader
 * returns plain rows/sums and the page decides what deserves pixels.
 * Errors degrade to "nothing to report" rather than breaking the page —
 * the dashboard is a summary, the module pages are the source of truth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { findUnbilledFeePeriods } from "@/lib/invoicing/agreement-fees";
import {
  findUninvoicedSOs,
  findUninvoicedWOs,
} from "@/lib/invoicing/uninvoiced";
import { round2 } from "@/lib/invoicing/status";

type OrgRef = {
  legal_name: string;
  display_name_da: string | null;
  display_name_en: string | null;
} | null;

function orgName(org: OrgRef): string | null {
  return org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days between an ISO date and today (positive = in the past). */
function daysSince(isoDate: string): number {
  return Math.floor(
    (Date.parse(todayISO()) - Date.parse(isoDate)) / 86_400_000,
  );
}

export type UninvoicedSummary = {
  total: number;
  woCount: number;
  woTotal: number;
  soCount: number;
  /** DKK-denominated SO value only — non-DKK rows are counted, not summed. */
  soTotalDkk: number;
  soNonDkkCount: number;
  feeMonths: number;
  feeTotal: number;
  draftInvoiceCount: number;
  draftOldestDays: number | null;
};

export type OverdueInvoiceRow = {
  id: string;
  invoiceNumber: string;
  orgName: string | null;
  total: number;
  currency: string;
  daysOverdue: number;
};

export type ExpiringAgreementRow = {
  id: string;
  name: string;
  orgName: string | null;
  endDate: string;
  daysLeft: number;
  monthlyFee: number;
  feeCurrency: string;
};

export type LatePORow = {
  id: string;
  poNumber: string;
  supplierName: string | null;
  daysLate: number;
};

export type MoneyBand = {
  uninvoiced: UninvoicedSummary;
  overdueInvoices: { rows: OverdueInvoiceRow[]; totalDkk: number };
  expiringAgreements: ExpiringAgreementRow[];
  latePOs: LatePORow[];
  draftPOCount: number;
};

const EXPIRY_WINDOW_DAYS = 90;

export async function loadMoneyBand(
  supabase: SupabaseClient,
): Promise<MoneyBand> {
  const today = todayISO();
  const expiryCutoff = new Date(
    Date.parse(today) + EXPIRY_WINDOW_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  const [wos, sos, fees, draftsRes, overdueRes, expiringRes, latePORes, draftPORes] =
    await Promise.all([
      findUninvoicedWOs(supabase),
      findUninvoicedSOs(supabase),
      findUnbilledFeePeriods(supabase),
      supabase
        .from("invoices")
        .select("created_at")
        .eq("status", "draft")
        .order("created_at", { ascending: true }),
      supabase
        .from("invoices")
        .select(
          `
            id, invoice_number, total_amount, currency, due_date,
            organization:organizations!organization_id(
              legal_name, display_name_da, display_name_en
            )
          `,
        )
        .in("status", ["issued", "overdue"])
        .is("credited_invoice_id", null)
        .not("due_date", "is", null)
        .lt("due_date", today)
        .order("due_date", { ascending: true }),
      supabase
        .from("service_agreements")
        .select(
          `
            id, name_en, name_da, end_date, monthly_fee, fee_currency,
            organization:organizations!organization_id(
              legal_name, display_name_da, display_name_en
            )
          `,
        )
        .eq("status", "active")
        .not("end_date", "is", null)
        .gte("end_date", today)
        .lte("end_date", expiryCutoff)
        .order("end_date", { ascending: true }),
      supabase
        .from("purchase_orders")
        .select("id, po_number, expected_date, supplier:suppliers(name)")
        .in("status", ["placed", "partially_received"])
        .not("expected_date", "is", null)
        .lt("expected_date", today)
        .order("expected_date", { ascending: true }),
      supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),
    ]);

  const woRows = Array.isArray(wos) ? wos : [];
  const soRows = Array.isArray(sos) ? sos : [];
  const feePeriods = "periods" in fees ? fees.periods : [];

  const woTotal = round2(woRows.reduce((s, r) => s + r.total, 0));
  const soDkk = soRows.filter((r) => r.currency.toUpperCase() === "DKK");
  const soTotalDkk = round2(soDkk.reduce((s, r) => s + r.total, 0));
  const feeTotal = round2(feePeriods.reduce((s, p) => s + p.fee, 0));

  const drafts = draftsRes.data ?? [];
  const draftOldest = drafts[0]?.created_at ?? null;

  const uninvoiced: UninvoicedSummary = {
    total: round2(woTotal + soTotalDkk + feeTotal),
    woCount: woRows.length,
    woTotal,
    soCount: soRows.length,
    soTotalDkk,
    soNonDkkCount: soRows.length - soDkk.length,
    feeMonths: feePeriods.length,
    feeTotal,
    draftInvoiceCount: drafts.length,
    draftOldestDays: draftOldest
      ? daysSince(draftOldest.slice(0, 10))
      : null,
  };

  const overdueRows: OverdueInvoiceRow[] = (overdueRes.data ?? []).map(
    (inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      orgName: orgName(one(inv.organization)),
      total: round2(Number(inv.total_amount ?? 0)),
      currency: (inv.currency as string | null)?.trim() || "DKK",
      daysOverdue: inv.due_date ? daysSince(inv.due_date) : 0,
    }),
  );
  const overdueTotalDkk = round2(
    overdueRows
      .filter((r) => r.currency === "DKK")
      .reduce((s, r) => s + r.total, 0),
  );

  const expiringAgreements: ExpiringAgreementRow[] = (
    expiringRes.data ?? []
  ).map((a) => ({
    id: a.id,
    name: a.name_da ?? a.name_en ?? "Service agreement",
    orgName: orgName(one(a.organization)),
    endDate: a.end_date as string,
    daysLeft: -daysSince(a.end_date as string),
    monthlyFee: round2(Number(a.monthly_fee ?? 0)),
    feeCurrency: (a.fee_currency as string | null)?.trim() || "DKK",
  }));

  const latePOs: LatePORow[] = (latePORes.data ?? []).map((po) => ({
    id: po.id,
    poNumber: po.po_number,
    supplierName: one(po.supplier)?.name ?? null,
    daysLate: po.expected_date ? daysSince(po.expected_date) : 0,
  }));

  return {
    uninvoiced,
    overdueInvoices: { rows: overdueRows, totalDkk: overdueTotalDkk },
    expiringAgreements,
    latePOs,
    draftPOCount: draftPORes.count ?? 0,
  };
}

export type MonthlyStat = {
  monthStart: string;
  bikesSold: number;
  bikesServiced: number;
  bikesUnderAgreement: number;
  invoicedSales: number;
  invoicedService: number;
  invoicedFees: number;
};

export async function loadMonthlyStats(
  supabase: SupabaseClient,
): Promise<MonthlyStat[]> {
  const { data, error } = await supabase.rpc("dashboard_monthly_stats");
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    monthStart: String(r.month_start),
    bikesSold: Number(r.bikes_sold ?? 0),
    bikesServiced: Number(r.bikes_serviced ?? 0),
    bikesUnderAgreement: Number(r.bikes_under_agreement ?? 0),
    invoicedSales: Number(r.invoiced_sales_dkk ?? 0),
    invoicedService: Number(r.invoiced_service_dkk ?? 0),
    invoicedFees: Number(r.invoiced_fees_dkk ?? 0),
  }));
}
