"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getOrFetchRate } from "@/lib/fx/get-or-fetch";
import { loadMOCoverage } from "@/lib/manufacturing/coverage";
import {
  recomputePOTotal,
  resolveAntiDumpingPctForPart,
  resolveTariffPctForPart,
} from "@/lib/purchasing/po-snapshots";

export type DraftPOResult =
  | {
      ok: true;
      pos: { id: string; poNumber: string; supplierName: string; lines: number }[];
      /** Shortfall parts that couldn't be placed on any PO. */
      skipped: { sku: string; name: string; reason: string }[];
    }
  | { ok: false; error: string };

/**
 * Turn an MO's stock shortfall into draft purchase orders — one PO per
 * supplier, supplier chosen from each part's offerings (preferred first).
 * Quantities are the shortfall rounded up to whole units and to the
 * offering's minimum order quantity. Prices/currency come from the
 * offering; fx/tariff/anti-dumping/transport snapshot exactly like the
 * manual PO line dialog (shared helpers). Parts with no supplier offering
 * are reported back as skipped — they need a human decision anyway.
 *
 * The POs stay in draft: review, adjust, then place them from /purchase-orders.
 */
export async function draftPOsFromShortfall(
  moId: string,
): Promise<DraftPOResult> {
  if (!moId) return { ok: false, error: "Missing MO id." };

  const supabase = await createClient();

  const { data: mo } = await supabase
    .from("manufacturing_orders")
    .select("id, mo_number, status")
    .eq("id", moId)
    .maybeSingle();
  if (!mo) return { ok: false, error: "Manufacturing order not found." };
  if (mo.status === "completed" || mo.status === "cancelled") {
    return { ok: false, error: `MO is ${mo.status} — nothing left to buy for it.` };
  }

  const coverage = await loadMOCoverage(supabase, moId);
  if ("error" in coverage) return { ok: false, error: coverage.error };
  if (coverage.shortfallRows.length === 0) {
    return { ok: false, error: "No shortfall — every part is covered by current stock." };
  }

  // Pick a supplier offering per shortfall part: preferred first, then the
  // cheapest known price. Parts without any offering are skipped.
  const partIds = coverage.shortfallRows.map((r) => r.partId);
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
    { supplierName: string; defaultCurrency: string | null; rows: typeof coverage.shortfallRows; offeringByPart: Map<string, Offering> }
  >();
  for (const row of coverage.shortfallRows) {
    const offering = bestOffering.get(row.partId);
    const supplier = offering
      ? Array.isArray(offering.supplier)
        ? offering.supplier[0]
        : offering.supplier
      : null;
    if (!offering || !supplier) {
      skipped.push({
        sku: row.sku,
        name: row.name,
        reason: "no supplier offering",
      });
      continue;
    }
    const group = bySupplier.get(supplier.id) ?? {
      supplierName: supplier.name as string,
      defaultCurrency: (supplier.default_currency as string | null) ?? null,
      rows: [],
      offeringByPart: new Map<string, Offering>(),
    };
    group.rows.push(row);
    group.offeringByPart.set(row.partId, offering);
    bySupplier.set(supplier.id, group);
  }

  if (bySupplier.size === 0) {
    return {
      ok: false,
      error:
        "None of the shortfall parts have a supplier offering — add offerings on the part pages first.",
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
        notes: `Drafted from ${mo.mo_number} stock shortfall (${coverage.remainingToBuild} bikes to build).`,
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
    for (const row of group.rows) {
      const offering = group.offeringByPart.get(row.partId)!;
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
      const quantity = Math.max(Math.ceil(row.shortfall), moq > 0 ? moq : 0);
      const hasPrice = offering.default_purchase_price != null;

      const [tariff_pct, anti_dumping_pct] = await Promise.all([
        resolveTariffPctForPart(supabase, row.partId),
        resolveAntiDumpingPctForPart(supabase, row.partId),
      ]);

      const { error: lineErr } = await supabase
        .from("purchase_order_lines")
        .insert({
          purchase_order_id: po.id,
          part_id: row.partId,
          quantity,
          unit_price: Number(offering.default_purchase_price ?? 0),
          currency,
          fx_rate_to_dkk,
          transport_pct,
          tariff_pct,
          anti_dumping_pct: anti_dumping_pct > 0 ? anti_dumping_pct : null,
          notes: [
            `Shortfall for ${mo.mo_number}: need ${row.demand}, on hand ${row.onHand}.`,
            moq > Math.ceil(row.shortfall) ? `Rounded up to MOQ ${moq}.` : null,
            hasPrice ? null : "No price on the supplier offering — set before placing.",
            fxNote,
          ]
            .filter(Boolean)
            .join(" "),
        });
      if (lineErr) {
        skipped.push({
          sku: row.sku,
          name: row.name,
          reason: `line failed: ${lineErr.message}`,
        });
        continue;
      }
      lines += 1;
    }

    await recomputePOTotal(supabase, po.id);
    pos.push({ id: po.id, poNumber, supplierName: group.supplierName, lines });
  }

  revalidatePath("/purchase-orders");
  revalidatePath(`/manufacturing-orders/${moId}`);
  return { ok: true, pos, skipped };
}
