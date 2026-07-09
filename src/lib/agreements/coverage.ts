/**
 * Derived service-agreement coverage for bikes.
 *
 * Coverage is NOT stored on the bike — a bike is covered IFF its owner
 * organization (narrowed to the owner unit when the agreement is
 * unit-scoped) has an agreement with status='active' whose date range
 * contains today. A unit-scoped agreement for a *different* unit does not
 * cover the bike; an org-wide agreement (organization_unit_id IS NULL)
 * covers all of the org's bikes. Because coverage follows ownership,
 * reassigning a bike changes its coverage implicitly — historical work
 * orders keep the agreement stamped on them at creation time.
 *
 * This is the single source for the rule; work-order creation (billability
 * stamp), the bike detail page, and the bikes list all resolve through it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * All agreements active today (status + date bounds), optionally narrowed
 * to one organization. Ordered newest-start-first so `resolveCoverage`
 * prefers the most recent agreement when several overlap.
 */
export async function loadActiveAgreements(
  supabase: SupabaseClient<Database>,
  organizationId?: string,
): Promise<ActiveAgreement[]> {
  const today = new Date().toISOString().slice(0, 10);
  let query = supabase
    .from("service_agreements")
    .select(
      "id, name_en, name_da, covers_parts, covers_labor, start_date, end_date, organization_id, organization_unit_id",
    )
    .eq("status", "active")
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order("start_date", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data } = await query;
  return (data ?? []) as ActiveAgreement[];
}

/**
 * Pick the agreement covering a bike owned by `organizationId` / `unitId`
 * from a pre-loaded active list. Unit-scoped agreements beat org-wide ones.
 */
export function resolveCoverage(
  agreements: ActiveAgreement[],
  organizationId: string | null,
  unitId: string | null,
): ActiveAgreement | null {
  if (!organizationId) return null;
  const forOrg = agreements.filter(
    (a) => a.organization_id === organizationId,
  );
  return (
    (unitId && forOrg.find((a) => a.organization_unit_id === unitId)) ||
    forOrg.find((a) => a.organization_unit_id == null) ||
    null
  );
}

/** Resolve coverage for one bike by id (loads the bike's owner first). */
export async function findActiveAgreementForBike(
  supabase: SupabaseClient<Database>,
  bikeId: string,
): Promise<ActiveAgreement | null> {
  const { data: bike } = await supabase
    .from("bikes")
    .select("owner_organization_id, owner_unit_id")
    .eq("id", bikeId)
    .maybeSingle();
  const orgId = bike?.owner_organization_id ?? null;
  if (!orgId) return null;
  const agreements = await loadActiveAgreements(supabase, orgId);
  return resolveCoverage(agreements, orgId, bike?.owner_unit_id ?? null);
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
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/** Matches the dashboard's "expiring soon" window. */
export const EXPIRY_WARNING_DAYS = 90;
