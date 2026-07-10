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
import { one } from "@/lib/supabase/embed";
import { loadAtSupplierBikeIds } from "@/lib/services/at-supplier";
import { OPEN_MO_STATUSES } from "@/lib/mo/status";
import { OPEN_TICKET_STATUSES } from "@/lib/maintenance/ticket-status";
import { OPEN_WO_STATUSES } from "@/lib/maintenance/work-order-status";

type OrgRef = {
  legal_name: string;
  display_name_da: string | null;
  display_name_en: string | null;
} | null;

function orgName(org: OrgRef): string | null {
  return org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? null;
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

export type Pipelines = {
  build: {
    planning: number;
    building: number;
    atPainter: number;
    inStock: number;
  };
  repair: { openTickets: number; openWOs: number; doneLast7: number };
  orders: {
    openSOs: number;
    soValueDkk: number;
    openMOs: number;
    openPOs: number;
  };
};

const OPEN_SO_STATUSES = ["confirmed", "in_production", "ready"] as const;

export async function loadPipelines(
  supabase: SupabaseClient,
): Promise<Pipelines> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [
    planningRes,
    buildingRes,
    inStockRes,
    unbuiltIdsRes,
    ticketsRes,
    wosRes,
    doneRes,
    sosRes,
    mosRes,
    posRes,
  ] = await Promise.all([
    supabase
      .from("bikes")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "planning"),
    supabase
      .from("bikes")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "building"),
    supabase
      .from("bikes")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "in_stock"),
    supabase
      .from("bikes")
      .select("id")
      .is("deleted_at", null)
      .in("status", ["planning", "building"]),
    supabase
      .from("maintenance_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN_TICKET_STATUSES),
    supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN_WO_STATUSES),
    supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", weekAgo),
    supabase
      .from("sales_orders")
      .select("total_amount, currency")
      .in("status", [...OPEN_SO_STATUSES]),
    supabase
      .from("manufacturing_orders")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN_MO_STATUSES),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["placed", "partially_received"]),
  ]);

  const unbuiltIds = (unbuiltIdsRes.data ?? []).map((b) => b.id as string);
  const atPainter = (await loadAtSupplierBikeIds(supabase, unbuiltIds)).size;

  const soRows = sosRes.data ?? [];
  const soValueDkk = round2(
    soRows
      .filter((r) => ((r.currency as string | null)?.trim() || "DKK") === "DKK")
      .reduce((s, r) => s + Number(r.total_amount ?? 0), 0),
  );

  return {
    build: {
      planning: planningRes.count ?? 0,
      building: buildingRes.count ?? 0,
      atPainter,
      inStock: inStockRes.count ?? 0,
    },
    repair: {
      openTickets: ticketsRes.count ?? 0,
      openWOs: wosRes.count ?? 0,
      doneLast7: doneRes.count ?? 0,
    },
    orders: {
      openSOs: soRows.length,
      soValueDkk,
      openMOs: mosRes.count ?? 0,
      openPOs: posRes.count ?? 0,
    },
  };
}

export type PurchasingMonth = { monthKey: string; landedDkk: number };

/**
 * Landed DKK committed per month (by PO order_date), last 12 months.
 * Aggregated app-side — a shop-scale line count, and it saves a migration.
 */
export async function loadPurchasingTrend(
  supabase: SupabaseClient,
): Promise<{ months: Map<string, number>; poCount: number; totalDkk: number }> {
  const from = new Date();
  from.setUTCMonth(from.getUTCMonth() - 11, 1);
  const fromISO = from.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("purchase_order_lines")
    .select(
      "quantity, landed_cost_dkk_per_unit, po:purchase_orders!purchase_order_id!inner(id, order_date, status)",
    )
    .in("po.status", ["placed", "partially_received", "received"])
    .gte("po.order_date", fromISO);

  const months = new Map<string, number>();
  const poIds = new Set<string>();
  let totalDkk = 0;
  for (const row of data ?? []) {
    const po = one(row.po);
    if (!po?.order_date) continue;
    const landed =
      Number(row.quantity ?? 0) * Number(row.landed_cost_dkk_per_unit ?? 0);
    if (!Number.isFinite(landed) || landed === 0) continue;
    const key = String(po.order_date).slice(0, 7);
    months.set(key, round2((months.get(key) ?? 0) + landed));
    poIds.add(po.id as string);
    totalDkk += landed;
  }
  return { months, poCount: poIds.size, totalDkk: round2(totalDkk) };
}

export type Housekeeping = {
  partsNoOrigin: number;
  partsNoHs: number;
  offeringsNoPrice: number;
  suppliersNoEmail: number;
  total: number;
};

export async function loadHousekeeping(
  supabase: SupabaseClient,
): Promise<Housekeeping> {
  const [originRes, hsRes, priceRes, emailRes] = await Promise.all([
    supabase
      .from("parts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("origin", null),
    supabase
      .from("parts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .is("hs_code_id", null),
    supabase
      .from("part_supplier_offerings")
      .select("id, part:parts!part_id!inner(id)", {
        count: "exact",
        head: true,
      })
      .is("default_purchase_price", null)
      .is("part.deleted_at", null),
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("is_active", true)
      .or("email_primary.is.null,email_primary.eq."),
  ]);
  const partsNoOrigin = originRes.count ?? 0;
  const partsNoHs = hsRes.count ?? 0;
  const offeringsNoPrice = priceRes.count ?? 0;
  const suppliersNoEmail = emailRes.count ?? 0;
  return {
    partsNoOrigin,
    partsNoHs,
    offeringsNoPrice,
    suppliersNoEmail,
    total: partsNoOrigin + partsNoHs + offeringsNoPrice + suppliersNoEmail,
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
