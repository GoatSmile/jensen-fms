/**
 * Landed-cost snapshot resolution + PO total recompute, shared by every
 * code path that writes purchase_order_lines (the PO line dialog actions
 * and the MO draft-PO-from-shortfall action). The snapshot rules are the
 * cost-basis contract from CLAUDE.md — keep them in one place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ImportTaxInputs, PartOrigin } from "./import-tax";

/**
 * Resolve everything the import-tax snapshot decision needs for a
 * (part, supplier) pair at the moment a line is written. The conclusion is
 * denormalised onto the PO line (tariff_pct, anti_dumping_pct,
 * import_tax_basis) so the cost basis — and its reason — stay frozen, same
 * rule as fx_rate_to_dkk.
 *
 * Rate resolution order (the rate that applies IF import tax is on):
 *   1. `parts.tariff_pct_override` if set (admin-managed escape hatch
 *      for misclassified or provisional parts).
 *   2. The active HS code's `tariff_pct` (+ its `anti_dumping_pct`).
 *   3. 0 — no HS or archived HS (`hasClassification` false).
 *
 * Whether the tax is applied by default — and which basis a zero gets — is
 * decided by the pure helpers in import-tax.ts over these inputs.
 */
export async function resolveImportTaxInputs(
  supabase: SupabaseClient,
  partId: string,
  supplierId: string | null,
): Promise<ImportTaxInputs> {
  const [partRes, supplierRes] = await Promise.all([
    supabase
      .from("parts")
      .select(
        "origin, tariff_pct_override, hs_code:hs_codes!hs_code_id(tariff_pct, anti_dumping_pct, is_active)",
      )
      .eq("id", partId)
      .maybeSingle(),
    supplierId
      ? supabase
          .from("suppliers")
          .select("import_duty_prepaid_default")
          .eq("id", supplierId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const part = partRes.data;
  const hsRaw = part?.hs_code;
  const hs = Array.isArray(hsRaw) ? hsRaw[0] : hsRaw;
  const activeHs = hs && hs.is_active ? hs : null;

  const hasOverride = part?.tariff_pct_override != null;
  const tariffPct = hasOverride
    ? Number(part.tariff_pct_override)
    : Number(activeHs?.tariff_pct ?? 0);

  return {
    origin: (part?.origin as PartOrigin | null) ?? null,
    tariffPct,
    antiDumpingPct: Number(activeHs?.anti_dumping_pct ?? 0),
    hasClassification: hasOverride || activeHs != null,
    supplierPrepaid: Boolean(
      supplierRes.data?.import_duty_prepaid_default ?? false,
    ),
  };
}

/**
 * Recompute the parent PO's `total_amount` after a lines change.
 *
 * V1 sums only lines whose currency matches the parent's `total_currency`.
 * Mixed-currency POs (rare — most are single-supplier so one currency) leave
 * any foreign-currency lines out of the total; the user can see the per-line
 * landed DKK in the table for the converted view. If no matching lines exist
 * we set the total to null so the detail page shows "—" instead of "0,00 kr."
 */
export async function recomputePOTotal(
  supabase: SupabaseClient,
  poId: string,
): Promise<void> {
  const [poRes, linesRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("total_currency")
      .eq("id", poId)
      .maybeSingle(),
    supabase
      .from("purchase_order_lines")
      .select("quantity, unit_price, currency")
      .eq("purchase_order_id", poId),
  ]);

  const totalCurrency = poRes.data?.total_currency ?? null;
  const lines = linesRes.data ?? [];

  let total: number | null = null;
  if (totalCurrency) {
    let sum = 0;
    let matched = 0;
    for (const l of lines) {
      if (l.currency !== totalCurrency) continue;
      sum += Number(l.quantity) * Number(l.unit_price);
      matched += 1;
    }
    total = matched > 0 ? Math.round(sum * 10000) / 10000 : null;
  }

  await supabase
    .from("purchase_orders")
    .update({
      total_amount: total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", poId);
}
