/**
 * Service-agreement coverage for bikes — PER BIKE (migration 110).
 *
 * A bike is covered IFF it has an ACTIVE line in `service_agreement_bikes`
 * that has started, on an agreement with status='active' whose date range
 * contains today. Coverage no longer follows ownership: in one department
 * some bikes are covered and some are not, and each line carries its own
 * start date and price. Reassigning a bike therefore does NOT move its
 * coverage — the line does, deliberately (moved/ended on the agreement page).
 * Historical work orders keep the agreement and line stamped at creation.
 *
 * This is the single source for the rule; work-order creation (billability
 * stamp), the bike detail page, the bikes list and the customer map all
 * resolve through it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Database } from "@/lib/types/database";

export type ActiveAgreement = {
  id: string;
  name_en: string;
  name_da: string | null;
  covers_parts: boolean;
  covers_labor: boolean;
  start_date: string;
  end_date: string | null;
  organization_id: string;
  organization_unit_id: string | null;
};

/** The agreement covering a bike, plus the line that does it. */
export type BikeCoverage = ActiveAgreement & {
  line_id: string;
  line_start_date: string;
};

const AGREEMENT_COLUMNS =
  "id, name_en, name_da, covers_parts, covers_labor, start_date, end_date, organization_id, organization_unit_id, status";

type LineRow = {
  id: string;
  bike_id: string;
  start_date: string;
  agreement: (ActiveAgreement & { status: string }) | null;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toCoverage(row: LineRow, on: string): BikeCoverage | null {
  const a = Array.isArray(row.agreement) ? row.agreement[0] : row.agreement;
  if (!a || a.status !== "active") return null;
  if (a.start_date > on || (a.end_date != null && a.end_date < on)) return null;
  if (row.start_date > on) return null;
  const { status: _status, ...agreement } = a;
  void _status;
  return { ...agreement, line_id: row.id, line_start_date: row.start_date };
}

/**
 * Coverage for the given bikes (or for EVERY covered bike when `bikeIds` is
 * omitted — the bikes list's fleet filter), keyed by bike id. Bikes with no
 * covering line are simply absent.
 */
export async function loadBikeCoverage(
  supabase: SupabaseClient<Database>,
  bikeIds?: string[],
): Promise<Map<string, BikeCoverage>> {
  const on = today();
  const out = new Map<string, BikeCoverage>();
  const select = `id, bike_id, start_date, agreement:service_agreements!agreement_id(${AGREEMENT_COLUMNS})`;
  const collect = (rows: LineRow[]) => {
    for (const r of rows) {
      const c = toCoverage(r, on);
      if (c) out.set(r.bike_id, c);
    }
  };

  if (bikeIds === undefined) {
    const { data, error } = await fetchAllRows<LineRow>((from, to) =>
      supabase
        .from("service_agreement_bikes")
        .select(select)
        .eq("status", "active")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{
        data: LineRow[] | null;
        error: { message: string } | null;
      }>,
    );
    if (error) throw new Error(`Failed to load agreement coverage: ${error}`);
    collect(data);
    return out;
  }

  // By id, in chunks: a long `id.in.(…)` list overruns the URL.
  for (let i = 0; i < bikeIds.length; i += 200) {
    const chunk = bikeIds.slice(i, i + 200);
    if (chunk.length === 0) continue;
    const { data, error } = await supabase
      .from("service_agreement_bikes")
      .select(select)
      .eq("status", "active")
      .in("bike_id", chunk);
    if (error) throw new Error(`Failed to load agreement coverage: ${error.message}`);
    collect((data ?? []) as unknown as LineRow[]);
  }
  return out;
}

/** Coverage for one bike, or null. */
export async function findActiveAgreementForBike(
  supabase: SupabaseClient<Database>,
  bikeId: string,
): Promise<BikeCoverage | null> {
  const map = await loadBikeCoverage(supabase, [bikeId]);
  return map.get(bikeId) ?? null;
}

/** "Covers parts and labour" / "… parts only" / "… labour only" / fee-only. */
export function coverageScopeLabel(a: ActiveAgreement): string {
  if (a.covers_parts && a.covers_labor) return "Covers parts and labour";
  if (a.covers_parts) return "Covers parts only";
  if (a.covers_labor) return "Covers labour only";
  return "Fee-only — repairs billed separately";
}

/** Whole days from today until `end_date`; null for open-ended agreements. */
export function daysUntilEnd(a: ActiveAgreement): number | null {
  if (!a.end_date) return null;
  const end = new Date(`${a.end_date}T00:00:00`);
  const todayDate = new Date(today() + "T00:00:00");
  return Math.round((end.getTime() - todayDate.getTime()) / 86_400_000);
}

/** Matches the dashboard's "expiring soon" window. */
export const EXPIRY_WARNING_DAYS = 90;
