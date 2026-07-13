"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  findUnbilledFeePeriods,
  monthLabel,
  type FeePeriod,
} from "@/lib/invoicing/agreement-fees";
import { round2 } from "@/lib/invoicing/status";
import { getTranslations } from "next-intl/server";

export type FeeInvoicesResult =
  | {
      ok: true;
      invoices: { id: string; orgName: string; lines: number; total: number }[];
      skipped: { name: string; reason: string }[];
    }
  | { ok: false; error: string };

/**
 * Draft the recurring agreement-fee invoices: one draft per customer,
 * one line per agreement-month (arrears — only fully elapsed months;
 * pro-rated periods say so in the description). Re-running is safe: the
 * engine only returns periods no live invoice line covers. Drafts carry
 * the usual DRAFT-xxxx placeholder until issue.
 */
export async function createAgreementFeeInvoices(): Promise<FeeInvoicesResult> {
  const t = await getTranslations("errors");
  const supabase = await createClient();

  const result = await findUnbilledFeePeriods(supabase);
  if ("error" in result) return { ok: false, error: result.error };
  if (result.periods.length === 0) {
    return {
      ok: false,
      error: t("invNothingToBill"),
    };
  }

  const { data: vat, error: vatErr } = await supabase
    .from("vat_codes")
    .select("code, default_rate")
    .eq("code", "DK_STANDARD")
    .eq("is_active", true)
    .maybeSingle();
  if (vatErr || !vat) {
    return {
      ok: false,
      error: t("invVatCodeMissing"),
    };
  }
  const vatRate = Number(vat.default_rate);

  const byOrg = new Map<string, FeePeriod[]>();
  for (const p of result.periods) {
    const list = byOrg.get(p.orgId) ?? [];
    list.push(p);
    byOrg.set(p.orgId, list);
  }

  const invoices: { id: string; orgName: string; lines: number; total: number }[] =
    [];

  for (const [orgId, periods] of byOrg) {
    let subtotal = 0;
    let totalVat = 0;
    const lineRows = periods.map((p, i) => {
      const prorationDa = p.prorated
        ? ` (forholdsmæssigt ${p.daysBilled}/${p.daysInMonth} dage)`
        : "";
      const prorationEn = p.prorated
        ? ` (pro-rated ${p.daysBilled}/${p.daysInMonth} days)`
        : "";
      const lineSubtotal = p.fee;
      const lineVat = round2(lineSubtotal * (vatRate / 100));
      subtotal = round2(subtotal + lineSubtotal);
      totalVat = round2(totalVat + lineVat);
      return {
        line_number: i + 1,
        service_agreement_id: p.agreementId,
        billing_period_start: p.periodStart,
        billing_period_end: p.periodEnd,
        description_da: `Serviceaftale: ${p.nameDa} — ${monthLabel(p.periodStart, "da")}${prorationDa}`,
        description_en: `Service agreement: ${p.nameEn} — ${monthLabel(p.periodStart, "en")}${prorationEn}`,
        quantity: 1,
        unit_price: p.fee,
        vat_code: vat.code,
        vat_rate: vatRate,
        line_subtotal: lineSubtotal,
        line_vat_amount: lineVat,
        line_total: round2(lineSubtotal + lineVat),
      };
    });

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .insert({
        invoice_number: `DRAFT-${crypto.randomUUID().slice(0, 8)}`,
        organization_id: orgId,
        language: periods[0].orgLanguage === "en" ? "en" : "da",
        status: "draft",
        currency: "DKK",
        subtotal_amount: subtotal,
        total_vat_amount: totalVat,
        total_amount: round2(subtotal + totalVat),
        notes: "Drafted from recurring agreement fees.",
      })
      .select("id")
      .single();
    if (invErr || !invoice) {
      return {
        ok: false,
        error:
          t("invCouldNotCreateFeeInvoice", {
            org: periods[0].orgName,
            detail: invErr?.message ?? t("unknownError"),
          }) +
          (invoices.length > 0
            ? t("invAlreadyDrafted", {
                names: invoices.map((d) => d.orgName).join(", "),
              })
            : ""),
      };
    }

    const { error: linesErr } = await supabase
      .from("invoice_lines")
      .insert(lineRows.map((l) => ({ ...l, invoice_id: invoice.id })));
    if (linesErr) {
      await supabase.from("invoices").delete().eq("id", invoice.id);
      return {
        ok: false,
        error: t("invCouldNotWriteFeeLines", {
          org: periods[0].orgName,
          detail: linesErr.message,
        }),
      };
    }

    invoices.push({
      id: invoice.id,
      orgName: periods[0].orgName,
      lines: lineRows.length,
      total: round2(subtotal + totalVat),
    });
  }

  revalidatePath("/invoices");
  return { ok: true, invoices, skipped: result.skipped };
}
