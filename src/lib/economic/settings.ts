import type { SupabaseClient } from "@supabase/supabase-js";

export type EconomicSettings = {
  enabled: boolean;
  journalNumber: number | null;
  revenueAccount: number | null;
  vatCode: string | null;
  customerGroup: number | null;
  vatZone: number | null;
  paymentTerms: number | null;
};

export async function loadEconomicSettings(
  supabase: SupabaseClient,
): Promise<EconomicSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select(
      "economic_enabled, economic_journal_number, economic_revenue_account, economic_vat_code, economic_customer_group, economic_vat_zone, economic_payment_terms",
    )
    .eq("id", 1)
    .maybeSingle();
  return {
    enabled: data?.economic_enabled === true,
    journalNumber: data?.economic_journal_number ?? null,
    revenueAccount: data?.economic_revenue_account ?? null,
    vatCode: (data?.economic_vat_code as string | null)?.trim() || null,
    customerGroup: data?.economic_customer_group ?? null,
    vatZone: data?.economic_vat_zone ?? null,
    paymentTerms: data?.economic_payment_terms ?? null,
  };
}

/** Human-readable list of config gaps that block a push; empty = ready. */
export function economicConfigGaps(s: EconomicSettings): string[] {
  const gaps: string[] = [];
  if (!s.enabled) gaps.push("integration is switched off");
  if (s.journalNumber == null) gaps.push("journal number not set");
  if (s.revenueAccount == null) gaps.push("revenue account not set");
  if (!s.vatCode) gaps.push("VAT code not set");
  if (s.customerGroup == null) gaps.push("customer group not set");
  if (s.vatZone == null) gaps.push("VAT zone not set");
  if (s.paymentTerms == null) gaps.push("payment terms not set");
  return gaps;
}
