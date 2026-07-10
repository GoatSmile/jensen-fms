/**
 * Drill-down behind the dashboard trend charts: the records that make up
 * one month's bar. Rows come back display-ready (formatted, linkable) so
 * the sheet component just renders.
 *
 * Semantics mirror the `dashboard_monthly_stats` RPC (migration 58/59):
 * sold = in_stock→assigned transitions (soft-deleted bikes excluded),
 * serviced = completed WOs, invoiced = issued DKK invoices by issued_date,
 * purchasing = landed DKK by PO order date. Months the Excel backfill
 * covers (`legacy_monthly_stats`) have no per-record history — the loader
 * returns a note explaining the difference instead of a roster.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatPrice } from "@/lib/format";
import { formatDate } from "@/lib/parts/format";
import { round2 } from "@/lib/invoicing/status";
import { one } from "@/lib/supabase/embed";

export type MonthDetailKind = "sold" | "serviced" | "invoiced" | "purchasing";

export type MonthDetailRow = {
  id: string;
  href: string;
  primary: string;
  secondary: string | null;
  right: string | null;
};

export type MonthDetail = {
  rows: MonthDetailRow[];
  /** Extra context line under the title, e.g. "6 work orders · 4 bikes". */
  countLine: string | null;
  /** Present when the Excel backfill contributes to this month's bar. */
  legacyNote: string | null;
};

type OrgEmbed = {
  legal_name: string;
  display_name_da: string | null;
  display_name_en: string | null;
} | null;

function orgName(org: OrgEmbed): string | null {
  return org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? null;
}


/** Calendar date of a timestamptz in the shop's timezone (RPC buckets match). */
function cphDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Copenhagen",
  });
}

/** Last day of the month that starts at `monthStart` (YYYY-MM-01). */
function monthEndISO(monthStart: string): string {
  const d = new Date(`${monthStart}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/** Padded UTC range that safely contains the Copenhagen month. */
function paddedRange(monthStart: string): { from: string; to: string } {
  const from = new Date(`${monthStart}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${monthStart}T00:00:00Z`);
  to.setUTCMonth(to.getUTCMonth() + 1, 2);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function loadLegacyRow(supabase: SupabaseClient, monthStart: string) {
  const { data } = await supabase
    .from("legacy_monthly_stats")
    .select(
      "bikes_sold, bikes_serviced, invoiced_sales_dkk, invoiced_service_dkk, invoiced_fees_dkk, source",
    )
    .eq("month_start", monthStart)
    .maybeSingle();
  return data ?? null;
}

function legacyNoteFor(
  kind: MonthDetailKind,
  leg: Awaited<ReturnType<typeof loadLegacyRow>>,
): string | null {
  if (!leg) return null;
  const n =
    kind === "sold"
      ? Number(leg.bikes_sold ?? 0)
      : kind === "serviced"
        ? Number(leg.bikes_serviced ?? 0)
        : kind === "invoiced"
          ? round2(
              Number(leg.invoiced_sales_dkk ?? 0) +
                Number(leg.invoiced_service_dkk ?? 0) +
                Number(leg.invoiced_fees_dkk ?? 0),
            )
          : 0;
  if (!n) return null;
  const what =
    kind === "invoiced"
      ? `${formatPrice(n, "DKK")} of this month's total`
      : `${n} of this month's count`;
  return `${what} comes from the historical import (pre-system${
    leg.source ? `: ${leg.source}` : ""
  }) — those records predate the system, so there is no per-record list for them.`;
}

async function loadSold(
  supabase: SupabaseClient,
  monthStart: string,
): Promise<{ rows: MonthDetailRow[]; countLine: string | null }> {
  const monthKey = monthStart.slice(0, 7);
  const { from, to } = paddedRange(monthStart);
  const { data } = await supabase
    .from("bike_state_log")
    .select(
      `
        bike_id, occurred_at,
        bike:bikes!bike_id!inner(
          id, frame_number, deleted_at,
          template:bike_templates(name_en, frame_size),
          owner:organizations!owner_organization_id(
            legal_name, display_name_da, display_name_en
          )
        )
      `,
    )
    .eq("to_status", "assigned")
    .eq("from_status", "in_stock")
    .gte("occurred_at", from)
    .lt("occurred_at", to)
    .order("occurred_at", { ascending: true });

  const seen = new Set<string>();
  const rows: MonthDetailRow[] = [];
  for (const r of data ?? []) {
    if (cphDate(r.occurred_at as string).slice(0, 7) !== monthKey) continue;
    const bike = one(r.bike);
    if (!bike || bike.deleted_at != null) continue;
    if (seen.has(r.bike_id as string)) continue;
    seen.add(r.bike_id as string);
    const template = one(bike.template);
    const templateLabel = template
      ? [template.name_en, template.frame_size].filter(Boolean).join(" · ")
      : null;
    const owner = orgName(one(bike.owner));
    rows.push({
      id: bike.id as string,
      href: `/bikes/${bike.id}`,
      primary: (bike.frame_number as string | null) ?? "(no frame number)",
      secondary: [templateLabel, owner].filter(Boolean).join(" → ") || null,
      right: formatDate(cphDate(r.occurred_at as string)),
    });
  }
  return { rows, countLine: null };
}

async function loadServiced(
  supabase: SupabaseClient,
  monthStart: string,
): Promise<{ rows: MonthDetailRow[]; countLine: string | null }> {
  const monthKey = monthStart.slice(0, 7);
  const { from, to } = paddedRange(monthStart);
  const { data } = await supabase
    .from("work_orders")
    .select(
      `
        id, wo_number, completed_at,
        bike:bikes!bike_id(
          id, frame_number, deleted_at,
          owner:organizations!owner_organization_id(
            legal_name, display_name_da, display_name_en
          )
        )
      `,
    )
    .eq("status", "completed")
    .gte("completed_at", from)
    .lt("completed_at", to)
    .order("completed_at", { ascending: true });

  const rows: MonthDetailRow[] = [];
  const bikeIds = new Set<string>();
  for (const r of data ?? []) {
    if (!r.completed_at) continue;
    if (cphDate(r.completed_at as string).slice(0, 7) !== monthKey) continue;
    const bike = one(r.bike);
    if (bike?.deleted_at != null) continue;
    if (bike?.id) bikeIds.add(bike.id as string);
    rows.push({
      id: r.id as string,
      href: `/maintenance/work-orders/${r.id}`,
      primary: r.wo_number as string,
      secondary:
        [bike?.frame_number, orgName(one(bike?.owner ?? null))]
          .filter(Boolean)
          .join(" · ") || null,
      right: formatDate(cphDate(r.completed_at as string)),
    });
  }
  const countLine =
    rows.length > 0
      ? `${rows.length} completed work order${rows.length === 1 ? "" : "s"} · ${bikeIds.size} bike${bikeIds.size === 1 ? "" : "s"}`
      : null;
  return { rows, countLine };
}

async function loadInvoiced(
  supabase: SupabaseClient,
  monthStart: string,
): Promise<{ rows: MonthDetailRow[]; countLine: string | null }> {
  const { data } = await supabase
    .from("invoices")
    .select(
      `
        id, invoice_number, kind, status, issued_date,
        lines:invoice_lines(line_subtotal),
        organization:organizations!organization_id(
          legal_name, display_name_da, display_name_en
        )
      `,
    )
    .in("status", ["issued", "paid", "overdue", "credited"])
    .eq("currency", "DKK")
    .gte("issued_date", monthStart)
    .lte("issued_date", monthEndISO(monthStart))
    .order("issued_date", { ascending: true });

  const rows: MonthDetailRow[] = (data ?? []).map((inv) => {
    const lines = Array.isArray(inv.lines) ? inv.lines : [];
    const exVat = round2(
      lines.reduce((s, l) => s + Number(l.line_subtotal ?? 0), 0),
    );
    return {
      id: inv.id as string,
      href: `/invoices/${inv.id}`,
      primary: inv.invoice_number as string,
      secondary: orgName(one(inv.organization)),
      right: formatPrice(exVat, "DKK"),
    };
  });
  const countLine =
    rows.length > 0 ? "Amounts are ex VAT, matching the chart." : null;
  return { rows, countLine };
}

async function loadPurchasing(
  supabase: SupabaseClient,
  monthStart: string,
): Promise<{ rows: MonthDetailRow[]; countLine: string | null }> {
  const { data } = await supabase
    .from("purchase_order_lines")
    .select(
      `
        quantity, landed_cost_dkk_per_unit,
        po:purchase_orders!purchase_order_id!inner(
          id, po_number, order_date, status, supplier:suppliers(name)
        )
      `,
    )
    .in("po.status", ["placed", "partially_received", "received"])
    .gte("po.order_date", monthStart)
    .lte("po.order_date", monthEndISO(monthStart));

  const byPO = new Map<
    string,
    { poNumber: string; supplier: string | null; date: string; landed: number }
  >();
  for (const row of data ?? []) {
    const po = one(row.po);
    if (!po) continue;
    const landed =
      Number(row.quantity ?? 0) * Number(row.landed_cost_dkk_per_unit ?? 0);
    if (!Number.isFinite(landed)) continue;
    const acc = byPO.get(po.id as string) ?? {
      poNumber: po.po_number as string,
      supplier: one(po.supplier)?.name ?? null,
      date: po.order_date as string,
      landed: 0,
    };
    acc.landed = round2(acc.landed + landed);
    byPO.set(po.id as string, acc);
  }
  const rows: MonthDetailRow[] = [...byPO.entries()]
    .sort((a, b) => a[1].date.localeCompare(b[1].date))
    .map(([id, po]) => ({
      id,
      href: `/purchase-orders/${id}`,
      primary: po.poNumber,
      secondary: po.supplier,
      right: formatPrice(po.landed, "DKK"),
    }));
  return { rows, countLine: rows.length > 0 ? "Landed cost, DKK." : null };
}

export async function loadMonthDetail(
  supabase: SupabaseClient,
  kind: MonthDetailKind,
  monthStart: string,
): Promise<MonthDetail> {
  const [detail, legacy] = await Promise.all([
    kind === "sold"
      ? loadSold(supabase, monthStart)
      : kind === "serviced"
        ? loadServiced(supabase, monthStart)
        : kind === "invoiced"
          ? loadInvoiced(supabase, monthStart)
          : loadPurchasing(supabase, monthStart),
    kind === "purchasing"
      ? Promise.resolve(null)
      : loadLegacyRow(supabase, monthStart),
  ]);
  return {
    rows: detail.rows,
    countLine: detail.countLine,
    legacyNote: legacyNoteFor(kind, legacy),
  };
}
