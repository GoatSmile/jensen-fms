/**
 * Landed-cost snapshot resolution + PO total recompute, shared by every
 * code path that writes purchase_order_lines (the PO line dialog actions
 * and the MO draft-PO-from-shortfall action). The snapshot rules are the
 * cost-basis contract from CLAUDE.md — keep them in one place.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Look up the EU import duty for a part at the moment its line is added to a
 * PO. The lookup is denormalised onto the PO line (tariff_pct) so the cost
 * basis stays frozen — same rule as fx_rate_to_dkk.
 *
 * Resolution order:
 *   1. `parts.tariff_pct_override` if set (admin-managed escape hatch
 *      for misclassified or provisional parts).
 *   2. The active HS code's `tariff_pct`.
 *   3. 0 — no HS, archived HS, or unclassified.
 */
export async function resolveTariffPctForPart(
  supabase: SupabaseClient,
  partId: string,
): Promise<number> {
  const { data: part } = await supabase
    .from("parts")
    .select(
      "tariff_pct_override, hs_code:hs_codes!hs_code_id(tariff_pct, is_active)",
    )
    .eq("id", partId)
    .maybeSingle();
  if (part?.tariff_pct_override != null) {
    return Number(part.tariff_pct_override);
  }
  const hs = Array.isArray(part?.hs_code) ? part?.hs_code[0] : part?.hs_code;
  if (!hs || !hs.is_active) return 0;
  return Number(hs.tariff_pct ?? 0);
}

/**
 * Look up the EU anti-dumping rate for a part at the moment its line is
 * added to a PO. Snapshotted alongside tariff_pct. Resolution: the active
 * HS code's `anti_dumping_pct`, or 0 when null.
 */
export async function resolveAntiDumpingPctForPart(
  supabase: SupabaseClient,
  partId: string,
): Promise<number> {
  const { data: part } = await supabase
    .from("parts")
    .select("hs_code:hs_codes!hs_code_id(anti_dumping_pct, is_active)")
    .eq("id", partId)
    .maybeSingle();
  const hs = Array.isArray(part?.hs_code) ? part?.hs_code[0] : part?.hs_code;
  if (!hs || !hs.is_active) return 0;
  return Number(hs.anti_dumping_pct ?? 0);
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
