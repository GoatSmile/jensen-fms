/**
 * "Uninvoiced work" queries — the money-on-the-table view that feeds
 * /invoices. Three independent sources:
 *
 *   - Completed billable work orders with no invoice yet. Value = parts at
 *     retail (work_order_parts.unit_price snapshots) + labor minutes × rate,
 *     with buckets zeroed out when the linked service agreement covers them
 *     (covers_parts / covers_labor). `is_billable = false` WOs are excluded
 *     entirely — the technician already decided the agreement covers it all.
 *   - Delivered sales orders with no non-cancelled invoice linked.
 *   - Active service agreements with a monthly fee — listed for visibility;
 *     recurring fee invoicing is a later slice.
 *
 * Server-side only. The create-invoice action recomputes from the same
 * source rows — these lists are display, not trusted input.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { round2 } from "@/lib/invoicing/status";
import { one } from "@/lib/supabase/embed";

type OrgRef = {
  id: string;
  legal_name: string;
  display_name_da: string | null;
  display_name_en: string | null;
} | null;

function orgName(org: OrgRef): string | null {
  return org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? null;
}


export type UninvoicedWORow = {
  woId: string;
  woNumber: string;
  completedAt: string | null;
  frameNumber: string | null;
  orgId: string | null;
  orgName: string | null;
  partsTotal: number;
  laborTotal: number;
  total: number;
  /** e.g. "parts covered by agreement" — why a bucket is zero. */
  coverageNote: string | null;
};

export async function findUninvoicedWOs(
  supabase: SupabaseClient,
): Promise<UninvoicedWORow[] | { error: string }> {
  const { data, error } = await supabase
    .from("work_orders")
    .select(
      `
        id, wo_number, completed_at, labor_minutes, labor_rate_dkk,
        agreement:service_agreements!covered_by_service_agreement_id(covers_parts, covers_labor),
        bike:bikes!bike_id(
          frame_number,
          owner_organization:organizations!owner_organization_id(
            id, legal_name, display_name_da, display_name_en
          )
        ),
        parts:work_order_parts(quantity, unit_price)
      `,
    )
    .eq("status", "completed")
    .eq("is_billable", true)
    .is("invoice_id", null)
    .order("completed_at", { ascending: true });
  if (error) {
    return { error: `Could not load uninvoiced work orders: ${error.message}` };
  }

  return (data ?? []).map((wo) => {
    const agreement = one(wo.agreement);
    const bike = one(wo.bike);
    const org = one(bike?.owner_organization ?? null);

    const coversParts = agreement?.covers_parts === true;
    const coversLabor = agreement?.covers_labor === true;

    const rawParts = (wo.parts ?? []).reduce(
      (sum, p) => sum + Number(p.quantity ?? 0) * Number(p.unit_price ?? 0),
      0,
    );
    const rawLabor =
      (Number(wo.labor_minutes ?? 0) / 60) * Number(wo.labor_rate_dkk ?? 0);

    const partsTotal = coversParts ? 0 : round2(rawParts);
    const laborTotal = coversLabor ? 0 : round2(rawLabor);

    const covered = [
      coversParts && rawParts > 0 ? "parts" : null,
      coversLabor && rawLabor > 0 ? "labor" : null,
    ].filter(Boolean);

    return {
      woId: wo.id,
      woNumber: wo.wo_number,
      completedAt: wo.completed_at,
      frameNumber: bike?.frame_number ?? null,
      orgId: org?.id ?? null,
      orgName: orgName(org),
      partsTotal,
      laborTotal,
      total: round2(partsTotal + laborTotal),
      coverageNote:
        covered.length > 0 ? `${covered.join(" + ")} covered by agreement` : null,
    };
  });
}

export type UninvoicedSORow = {
  soId: string;
  soNumber: string;
  deliveredDate: string | null;
  orgName: string | null;
  total: number;
  currency: string;
};

export async function findUninvoicedSOs(
  supabase: SupabaseClient,
): Promise<UninvoicedSORow[] | { error: string }> {
  const [invoicedRes, sosRes] = await Promise.all([
    // Only a standard/final invoice means the SO is invoiced — a deposit
    // (acontofaktura) leaves the SO still needing its final, so deposits must
    // NOT exclude it here. Cancelled/credited invoices and credit notes (which
    // inherit the SO link) don't block re-invoicing either.
    supabase
      .from("invoices")
      .select("sales_order_id")
      .not("sales_order_id", "is", null)
      .in("kind", ["standard", "final"])
      .not("status", "in", "(cancelled,credited)")
      .is("credited_invoice_id", null),
    supabase
      .from("sales_orders")
      .select(
        `
          id, sales_order_number, actual_delivery_date, total_amount, currency,
          organization:organizations!organization_id(
            id, legal_name, display_name_da, display_name_en
          )
        `,
      )
      .eq("status", "delivered")
      .order("actual_delivery_date", { ascending: true }),
  ]);
  if (sosRes.error) {
    return { error: `Could not load delivered SOs: ${sosRes.error.message}` };
  }

  const invoicedSoIds = new Set(
    (invoicedRes.data ?? []).map((r) => r.sales_order_id as string),
  );

  return (sosRes.data ?? [])
    .filter((so) => !invoicedSoIds.has(so.id))
    .map((so) => ({
      soId: so.id,
      soNumber: so.sales_order_number,
      deliveredDate: so.actual_delivery_date,
      orgName: orgName(one(so.organization)),
      total: round2(Number(so.total_amount ?? 0)),
      currency: (so.currency as string | null)?.trim() || "DKK",
    }));
}

export type AgreementFeeRow = {
  agreementId: string;
  name: string;
  orgName: string | null;
  monthlyFee: number;
  currency: string;
};

export async function findAgreementMonthlyFees(
  supabase: SupabaseClient,
): Promise<AgreementFeeRow[] | { error: string }> {
  const { data, error } = await supabase
    .from("service_agreements")
    .select(
      `
        id, name_en, name_da, monthly_fee, fee_currency,
        organization:organizations!organization_id(
          id, legal_name, display_name_da, display_name_en
        )
      `,
    )
    .eq("status", "active")
    .gt("monthly_fee", 0)
    .order("monthly_fee", { ascending: false });
  if (error) {
    return { error: `Could not load agreement fees: ${error.message}` };
  }

  return (data ?? []).map((a) => ({
    agreementId: a.id,
    name: a.name_da ?? a.name_en ?? "Service agreement",
    orgName: orgName(one(a.organization)),
    monthlyFee: round2(Number(a.monthly_fee ?? 0)),
    currency: (a.fee_currency as string | null)?.trim() || "DKK",
  }));
}
