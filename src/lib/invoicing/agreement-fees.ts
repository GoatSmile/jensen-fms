/**
 * Recurring agreement-fee engine. Policy (owner, June 2026): bill in
 * ARREARS (only months that have fully elapsed), consolidate per customer
 * (one invoice, one line per agreement-month), pro-rate partial months by
 * days (agreement start and end dates both cap a month).
 *
 * "Billed through" for an agreement = max(billing_period_end) over its
 * fee lines on invoices that are not cancelled, not credited, and not
 * themselves credit notes — so crediting a fee invoice makes those months
 * billable again, and re-running the generator never double-bills.
 *
 * Agreements with status active OR expired are billable (an agreement that
 * expired with unbilled months still gets them); cancelled ones are not.
 * Non-DKK fees are skipped with a reason — everything billed today is DKK.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { round2 } from "@/lib/invoicing/status";

export type FeePeriod = {
  agreementId: string;
  nameDa: string;
  nameEn: string;
  orgId: string;
  orgName: string;
  orgLanguage: string;
  /** ISO dates, inclusive. */
  periodStart: string;
  periodEnd: string;
  /** Pro-rated amount for this period. */
  fee: number;
  monthlyFee: number;
  daysBilled: number;
  daysInMonth: number;
  prorated: boolean;
};

export type UnbilledFees = {
  periods: FeePeriod[];
  skipped: { name: string; reason: string }[];
};

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/** Last day of the month containing d (UTC). */
function lastDayOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/**
 * Every unbilled agreement-month up to (and including) the last fully
 * elapsed month before `asOf`.
 */
export async function findUnbilledFeePeriods(
  supabase: SupabaseClient,
  asOf: Date = new Date(),
): Promise<UnbilledFees | { error: string }> {
  const { data: agreements, error: agrErr } = await supabase
    .from("service_agreements")
    .select(
      `
        id, name_en, name_da, monthly_fee, fee_currency, start_date, end_date, status,
        organization:organizations!organization_id(
          id, legal_name, display_name_da, display_name_en, preferred_language
        )
      `,
    )
    .in("status", ["active", "expired"])
    .gt("monthly_fee", 0);
  if (agrErr) {
    return { error: `Could not load agreements: ${agrErr.message}` };
  }
  if (!agreements || agreements.length === 0) {
    return { periods: [], skipped: [] };
  }

  // Billed-through per agreement, from live (non-cancelled, non-credited)
  // fee lines that are not on credit notes.
  const { data: billedLines, error: lineErr } = await supabase
    .from("invoice_lines")
    .select(
      `service_agreement_id, billing_period_end,
       invoice:invoices!invoice_id(status, credited_invoice_id)`,
    )
    .in(
      "service_agreement_id",
      agreements.map((a) => a.id),
    )
    .not("billing_period_end", "is", null);
  if (lineErr) {
    return { error: `Could not load billed periods: ${lineErr.message}` };
  }
  const billedThrough = new Map<string, string>();
  for (const line of billedLines ?? []) {
    const inv = Array.isArray(line.invoice) ? line.invoice[0] : line.invoice;
    if (!inv || inv.status === "cancelled" || inv.status === "credited") continue;
    if (inv.credited_invoice_id) continue; // a credit note's mirror lines
    const prev = billedThrough.get(line.service_agreement_id!);
    if (!prev || line.billing_period_end! > prev) {
      billedThrough.set(line.service_agreement_id!, line.billing_period_end!);
    }
  }

  // Arrears: nothing later than the last day of the month before asOf.
  const lastBillableDay = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 0),
  );

  const periods: FeePeriod[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const a of agreements) {
    const org = Array.isArray(a.organization) ? a.organization[0] : a.organization;
    const name = a.name_da ?? a.name_en ?? "Service agreement";
    if (!org) {
      skipped.push({ name, reason: "no customer organization" });
      continue;
    }
    const currency = ((a.fee_currency as string | null)?.trim() || "DKK").toUpperCase();
    if (currency !== "DKK") {
      skipped.push({ name, reason: `fee in ${currency} — only DKK supported` });
      continue;
    }
    if (!a.start_date) {
      skipped.push({ name, reason: "no start date" });
      continue;
    }

    const billed = billedThrough.get(a.id);
    let cursor = billed ? addDays(utc(billed), 1) : utc(a.start_date);
    let horizon = lastBillableDay;
    if (a.end_date && utc(a.end_date) < horizon) horizon = utc(a.end_date);

    const monthlyFee = Number(a.monthly_fee);
    while (cursor <= horizon) {
      const monthEnd = lastDayOfMonth(cursor);
      const periodEnd = monthEnd < horizon ? monthEnd : horizon;
      const daysInMonth = monthEnd.getUTCDate();
      const daysBilled =
        Math.round((periodEnd.getTime() - cursor.getTime()) / 86_400_000) + 1;
      const prorated = daysBilled < daysInMonth;

      periods.push({
        agreementId: a.id,
        nameDa: a.name_da ?? a.name_en ?? "Serviceaftale",
        nameEn: a.name_en ?? a.name_da ?? "Service agreement",
        orgId: org.id,
        orgName:
          org.display_name_da ?? org.display_name_en ?? org.legal_name ?? "—",
        orgLanguage: (org.preferred_language as string | null)?.trim() || "da",
        periodStart: iso(cursor),
        periodEnd: iso(periodEnd),
        fee: round2(prorated ? (monthlyFee * daysBilled) / daysInMonth : monthlyFee),
        monthlyFee: round2(monthlyFee),
        daysBilled,
        daysInMonth,
        prorated,
      });

      cursor = addDays(periodEnd, 1);
    }
  }

  return { periods, skipped };
}

/** Month label for fee-line descriptions, e.g. "juni 2026" / "June 2026". */
export function monthLabel(periodStart: string, locale: "da" | "en"): string {
  return new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc(periodStart));
}
