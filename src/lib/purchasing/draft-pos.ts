/**
 * Shared "demand → draft POs" engine: given a list of parts and desired
 * purchase quantities, group them by supplier (preferred offering first,
 * then cheapest), create one draft PO per supplier, and write lines with
 * the full landed-cost snapshot (FX for today, transport default from
 * app_settings, tariff + anti-dumping from the part's HS code via
 * po-snapshots.ts). Quantities are rounded up to the offering's MOQ.
 *
 * Used by the MO shortfall action and the reorder-point action — one code
 * path for every machine-drafted PO, so the cost-basis contract can't
 * drift between entry points. Parts with no supplier offering are
 * reported back as skipped (they need a human decision anyway).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrFetchRate } from "@/lib/fx/get-or-fetch";
import {
  recomputePOTotal,
  resolveAntiDumpingPctForPart,
  resolveTariffPctForPart,
} from "@/lib/purchasing/po-snapshots";

export type DraftPODemand = {
  partId: string;
  sku: string;
  name: string;
  /** Desired purchase quantity BEFORE MOQ rounding (whole units). */
  quantity: number;
  /** Per-line traceability note, e.g. "Shortfall for MO-x: need 10, on hand 4." */
  lineNote: string;
};

export type DraftPOsOutcome =
  | {
      ok: true;
      pos: { id: string; poNumber: string; supplierName: string; lines: number }[];
      skipped: { sku: string; name: string; reason: string }[];
    }
  | { ok: false; error: string };

export async function createDraftPOsForDemand(
  supabase: SupabaseClient,
  demands: DraftPODemand[],
  poNote: string,
): Promise<DraftPOsOutcome> {
  if (demands.length === 0) {
    return { ok: false, error: "Nothing to order." };
  }

  // Pick a supplier offering per part: preferred first, then the cheapest
  // known price. Parts without any offering are skipped.
  const partIds = demands.map((d) => d.partId);
  const { data: offerings, error: offErr } = await supabase
    .from("part_supplier_offerings")
    .select(
      `part_id, supplier_id, default_purchase_price, default_purchase_currency,
       minimum_order_quantity, is_preferred,
       supplier:suppliers!supplier_id(id, name, default_currency)`,
    )
    .in("part_id", partIds);
  if (offErr) {
    return { ok: false, error: `Could not load supplier offerings: ${offErr.message}` };
  }

  type Offering = NonNullable<typeof offerings>[number];
  const bestOffering = new Map<string, Offering>();
  for (const o of offerings ?? []) {
    const current = bestOffering.get(o.part_id);
    if (!current) {
      bestOffering.set(o.part_id, o);
      continue;
    }
    const better =
      (o.is_preferred ? 1 : 0) - (current.is_preferred ? 1 : 0) ||
      Number(current.default_purchase_price ?? Infinity) -
        Number(o.default_purchase_price ?? Infinity);
    if (better > 0) bestOffering.set(o.part_id, o);
  }

  const skipped: { sku: string; name: string; reason: string }[] = [];
  const bySupplier = new Map<
    string,
    {
      supplierName: string;
      defaultCurrency: string | null;
      demands: DraftPODemand[];
      offeringByPart: Map<string, Offering>;
    }
  >();
  for (const demand of demands) {
    const offering = bestOffering.get(demand.partId);
    const supplier = offering
      ? Array.isArray(offering.supplier)
        ? offering.supplier[0]
        : offering.supplier
      : null;
    if (!offering || !supplier) {
      skipped.push({
        sku: demand.sku,
        name: demand.name,
        reason: "no supplier offering",
      });
      continue;
    }
    const group = bySupplier.get(supplier.id) ?? {
      supplierName: supplier.name as string,
      defaultCurrency: (supplier.default_currency as string | null) ?? null,
      demands: [],
      offeringByPart: new Map<string, Offering>(),
    };
    group.demands.push(demand);
    group.offeringByPart.set(demand.partId, offering);
    bySupplier.set(supplier.id, group);
  }

  if (bySupplier.size === 0) {
    return {
      ok: false,
      error:
        "None of these parts have a supplier offering — add offerings on the part pages first.",
    };
  }

  // App-wide transport default (0.10 fallback mirrors the schema default).
  const { data: settings } = await supabase
    .from("app_settings")
    .select("default_transport_pct")
    .eq("id", 1)
    .maybeSingle();
  const transport_pct = Number(settings?.default_transport_pct ?? 0.1);

  const today = new Date().toISOString().slice(0, 10);
  const pos: { id: string; poNumber: string; supplierName: string; lines: number }[] =
    [];

  for (const [supplierId, group] of bySupplier) {
    const { data: poNumber, error: numErr } = await supabase.rpc(
      "next_document_number",
      { p_doc_type: "purchase_order" },
    );
    if (numErr || typeof poNumber !== "string") {
      return {
        ok: false,
        error: `Could not allocate PO number: ${numErr?.message ?? "unknown error"}${
          pos.length > 0
            ? ` Already created: ${pos.map((p) => p.poNumber).join(", ")}.`
            : ""
        }`,
      };
    }

    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        po_number: poNumber,
        supplier_id: supplierId,
        status: "draft",
        order_date: today,
        total_currency: group.defaultCurrency ?? "DKK",
        notes: poNote,
      })
      .select("id")
      .single();
    if (poErr || !po) {
      return {
        ok: false,
        error: `Could not create PO for ${group.supplierName}: ${poErr?.message ?? "unknown error"}`,
      };
    }

    let lines = 0;
    for (const demand of group.demands) {
      const offering = group.offeringByPart.get(demand.partId)!;
      const currency = (
        (offering.default_purchase_currency as string | null) ??
        group.defaultCurrency ??
        "DKK"
      ).toUpperCase();

      let fx_rate_to_dkk = 1;
      let fxNote: string | null = null;
      if (currency !== "DKK") {
        const rate = await getOrFetchRate(supabase, currency, "DKK", today);
        if (rate) {
          fx_rate_to_dkk = rate.rate;
        } else {
          fxNote = `FX ${currency}→DKK unavailable — rate set to 1, fix before placing.`;
        }
      }

      const moq = Number(offering.minimum_order_quantity ?? 0);
      const quantity = Math.max(Math.ceil(demand.quantity), moq > 0 ? moq : 0);
      const hasPrice = offering.default_purchase_price != null;

      const [tariff_pct, anti_dumping_pct] = await Promise.all([
        resolveTariffPctForPart(supabase, demand.partId),
        resolveAntiDumpingPctForPart(supabase, demand.partId),
      ]);

      const { error: lineErr } = await supabase
        .from("purchase_order_lines")
        .insert({
          purchase_order_id: po.id,
          part_id: demand.partId,
          quantity,
          unit_price: Number(offering.default_purchase_price ?? 0),
          currency,
          fx_rate_to_dkk,
          transport_pct,
          tariff_pct,
          anti_dumping_pct: anti_dumping_pct > 0 ? anti_dumping_pct : null,
          notes: [
            demand.lineNote,
            moq > Math.ceil(demand.quantity) ? `Rounded up to MOQ ${moq}.` : null,
            hasPrice ? null : "No price on the supplier offering — set before placing.",
            fxNote,
          ]
            .filter(Boolean)
            .join(" "),
        });
      if (lineErr) {
        skipped.push({
          sku: demand.sku,
          name: demand.name,
          reason: `line failed: ${lineErr.message}`,
        });
        continue;
      }
      lines += 1;
    }

    await recomputePOTotal(supabase, po.id);
    pos.push({ id: po.id, poNumber, supplierName: group.supplierName, lines });
  }

  return { ok: true, pos, skipped };
}
