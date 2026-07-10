/**
 * Template cost-to-paint estimate.
 *
 * A template declares its paintwork in `bike_template_service_parts` (which
 * service part-units one bike sends to the painter: stel, forgaffel, kurv…).
 * This loader prices that declaration against the DEFAULT painter's current
 * price list at PER-BIKE quantities — a single bike sits in the 1–9 tier;
 * batch tiers apply on the paint order itself, where the real quantity is
 * known and the send freezes the snapshot.
 *
 * The DKK total feeds the template's cost-to-produce + margin box (the
 * 310→710 kr lesson). Non-DKK lists convert via the shared ECB lookup; if
 * the rate can't be resolved the total degrades to null and the margin box
 * falls back to parts-only rather than mixing currencies.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { formatPrice } from "@/lib/format";
import { getOrFetchRate } from "@/lib/fx/get-or-fetch";
import { one } from "@/lib/supabase/embed";

import {
  priceOrderItems,
  tierLabel,
  type ServicePriceItem,
} from "./pricing";
import {
  DEFAULT_PAINTER_NAME,
  PAINT_SERVICE_SLUG,
  loadServiceTypeBySlug,
} from "./vocab";

export type TemplatePaintworkRow = {
  id: string;
  partTypeId: string;
  partTypeName: string;
  quantity: number;
  /** Formatted per-piece / line estimate; null = the list has no price. */
  unitPriceLabel: string | null;
  lineTotalLabel: string | null;
  tierBadge: string | null;
};

export type TemplatePaintEstimate = {
  rows: TemplatePaintworkRow[];
  /** Estimated paint cost per bike in DKK; null when it can't be computed
   * (no list, nothing priced, or FX lookup failed on a non-DKK list). */
  totalDkk: number | null;
  /** Formatted total in the list's own currency; null when nothing priced. */
  totalLabel: string | null;
  /** Which list priced the estimate, e.g. "SIK priser 2026 · Metacoat A/S". */
  listLabel: string | null;
  unpricedCount: number;
};

/**
 * The default painter's current list for the painting type — Metacoat by
 * name when it has one, else the sole/first current list. Null when nobody
 * has a current painting price list.
 */
async function loadDefaultPaintList(
  supabase: SupabaseClient<Database>,
): Promise<{
  name: string;
  supplierName: string | null;
  currency: string;
  items: ServicePriceItem[];
} | null> {
  const serviceType = await loadServiceTypeBySlug(supabase, PAINT_SERVICE_SLUG);
  if (!serviceType) return null;

  const { data, error } = await supabase
    .from("service_price_lists")
    .select(
      `id, name, currency,
       supplier:suppliers(name),
       items:service_price_items(
         id, service_part_type_id, supplier_item_no, tier_min, tier_max, unit_price
       )`,
    )
    .eq("service_type_id", serviceType.id)
    .eq("is_current", true);
  if (error || !data || data.length === 0) return null;

  const lists = data
    .map((l) => ({
      name: l.name,
      supplierName: one(l.supplier)?.name ?? null,
      currency: l.currency,
      items: (l.items ?? []).map((i) => ({
        id: i.id,
        service_part_type_id: i.service_part_type_id,
        supplier_item_no: i.supplier_item_no,
        tier_min: i.tier_min,
        tier_max: i.tier_max,
        unit_price: Number(i.unit_price),
      })),
    }))
    .sort((a, b) => (a.supplierName ?? "").localeCompare(b.supplierName ?? ""));
  return (
    lists.find((l) => l.supplierName === DEFAULT_PAINTER_NAME) ?? lists[0]
  );
}

export async function loadTemplatePaintEstimate(
  supabase: SupabaseClient<Database>,
  templateId: string,
): Promise<TemplatePaintEstimate> {
  const empty: TemplatePaintEstimate = {
    rows: [],
    totalDkk: null,
    totalLabel: null,
    listLabel: null,
    unpricedCount: 0,
  };

  const { data: paintRows, error } = await supabase
    .from("bike_template_service_parts")
    .select(
      "id, service_part_type_id, quantity, part_type:service_part_types(name_en, sort_order)",
    )
    .eq("template_id", templateId);
  if (error || !paintRows) return empty;

  const list = await loadDefaultPaintList(supabase);
  const listLabel = list
    ? [list.name, list.supplierName].filter(Boolean).join(" · ")
    : null;

  const priced = priceOrderItems(
    { items: list?.items ?? [] },
    paintRows.map((r) => ({
      id: r.id,
      service_part_type_id: r.service_part_type_id,
      quantity: r.quantity,
    })),
  );

  const rows: TemplatePaintworkRow[] = paintRows
    .map((r) => ({ r, partType: one(r.part_type) }))
    .sort(
      (a, b) =>
        (a.partType?.sort_order ?? 0) - (b.partType?.sort_order ?? 0) ||
        (a.partType?.name_en ?? "").localeCompare(b.partType?.name_en ?? ""),
    )
    .map(({ r, partType }) => {
      const resolved = priced.byItemId.get(r.id) ?? null;
      return {
        id: r.id,
        partTypeId: r.service_part_type_id,
        partTypeName: partType?.name_en ?? "—",
        quantity: r.quantity,
        unitPriceLabel:
          resolved && list
            ? formatPrice(resolved.item.unit_price, list.currency)
            : null,
        lineTotalLabel:
          resolved && list
            ? formatPrice(resolved.lineTotal, list.currency)
            : null,
        tierBadge: resolved ? tierLabel(resolved.item) : null,
      };
    });

  const anyPriced = rows.some((r) => r.unitPriceLabel != null);
  const totalLabel =
    anyPriced && list ? formatPrice(priced.total, list.currency) : null;

  // DKK total for the margin math; ECB conversion for a non-DKK list.
  let totalDkk: number | null = null;
  if (anyPriced && list) {
    if (list.currency === "DKK") {
      totalDkk = priced.total;
    } else {
      const fx = await getOrFetchRate(
        supabase,
        list.currency,
        "DKK",
        new Date().toISOString().slice(0, 10),
      );
      totalDkk = fx ? priced.total * fx.rate : null;
    }
  }

  return {
    rows,
    totalDkk,
    totalLabel,
    listLabel,
    unpricedCount: priced.unpricedCount,
  };
}
