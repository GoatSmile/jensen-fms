/**
 * Template cost-to-paint estimate.
 *
 * A template declares its paintwork in `bike_template_service_parts` (which
 * service part-units one bike sends to the painter: stel, forgaffel, kurv…).
 * This loader prices that declaration against the DEFAULT painter's current
 * price list.
 *
 * THE HEADLINE NUMBER IS ALWAYS THE SINGLES TIER, deliberately. A template
 * cannot know the batch its bikes will be built in, and a cheaper assumed
 * batch would quietly inflate the margin on every quote built from it — the
 * failure the 310→710 lesson already paid for once. Singles overstates cost,
 * which is the safe direction. The `ladder` carries the batch prices beside
 * it as information, never as the arithmetic.
 *
 * Note the tier no longer moves with the recipe number: the batch is stated
 * by this loader (`priceTemplatePerBike`), so a per-bike quantity can only
 * ever multiply. Real prices live on the paint order, where the quantity is
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
  paintBatchBreakpoints,
  priceTemplatePerBike,
  tierLabel,
  type ServicePriceItem,
} from "./pricing";
import { PAINT_SERVICE_SLUG, loadServiceTypeBySlug } from "./vocab";

export type TemplatePaintworkRow = {
  id: string;
  partTypeId: string;
  /** English service-part-type vocab name. */
  partTypeName: string;
  /** Danish service-part-type vocab name; localize the display at render. */
  partTypeNameDa: string | null;
  quantity: number;
  /** Formatted per-piece / line estimate; null = the list has no price. */
  unitPriceLabel: string | null;
  lineTotalLabel: string | null;
  tierBadge: string | null;
};

/** One rung: what a bike costs to paint when built in a batch this size. */
export type TemplatePaintLadderRung = {
  /** Bikes at which this price starts applying. */
  fromBikes: number;
  /** Last batch size at this price; null = open top. */
  toBikes: number | null;
  perBikeLabel: string;
};

export type TemplatePaintEstimate = {
  rows: TemplatePaintworkRow[];
  /**
   * Per-bike cost at each batch size that changes it, singles first. Empty
   * when the price is flat (nothing to show) or nothing could be priced.
   */
  ladder: TemplatePaintLadderRung[];
  /** Estimated paint cost per bike in DKK; null when it can't be computed
   * (no list, nothing priced, or FX lookup failed on a non-DKK list). */
  totalDkk: number | null;
  /** Formatted total in the list's own currency; null when nothing priced. */
  totalLabel: string | null;
  /** Which list priced the estimate, e.g. "SIK priser 2026 · Metacoat A/S". */
  listLabel: string | null;
  unpricedCount: number;
  /**
   * Set when no list could be used, so the UI can say WHY instead of showing a
   * blank cost. Null when the default supplier's list priced the estimate.
   */
  unavailable: PaintListUnavailable | null;
};

type PaintList = {
  name: string;
  supplierId: string | null;
  supplierName: string | null;
  currency: string;
  items: ServicePriceItem[];
};

/**
 * Why there is no estimate, when there isn't one. Each case needs a different
 * sentence on screen and a different fix, so they are distinct rather than one
 * "unavailable".
 */
export type PaintListUnavailable =
  | { reason: "no_service_type" }
  /** No default painter configured — set one on a price list in /admin/services. */
  | { reason: "no_default_supplier" }
  /** A default IS set, but that supplier has no current list. */
  | { reason: "default_has_no_list"; supplierName: string | null };

type PaintListResolution =
  { ok: true; list: PaintList } | ({ ok: false } & PaintListUnavailable);

/** Drop the discriminant so the reason can travel on the estimate. */
function stripOk(
  resolution: { ok: false } & PaintListUnavailable,
): PaintListUnavailable {
  return resolution.reason === "default_has_no_list"
    ? { reason: resolution.reason, supplierName: resolution.supplierName }
    : { reason: resolution.reason };
}

/**
 * The default painter's current list for the painting type — **the configured
 * default supplier's list, or nothing.**
 *
 * It used to fall back to `lists[0]` when the default supplier had no current
 * list. That was silent and it misled: on 2026-07-29 the painting default was
 * set to a supplier with no price list, and every template went on showing a
 * cost-to-paint priced off a DIFFERENT supplier, feeding that number into
 * cost-to-produce and margin. A total that quietly comes from a supplier nobody
 * chose is worse than no total, so this refuses and the caller says why.
 */
async function loadDefaultPaintList(
  supabase: SupabaseClient<Database>,
): Promise<PaintListResolution> {
  const serviceType = await loadServiceTypeBySlug(supabase, PAINT_SERVICE_SLUG);
  if (!serviceType) return { ok: false, reason: "no_service_type" };
  if (!serviceType.default_supplier_id) {
    return { ok: false, reason: "no_default_supplier" };
  }

  const { data, error } = await supabase
    .from("service_price_lists")
    .select(
      `id, name, currency,
       supplier:suppliers(id, name),
       items:service_price_items(
         id, service_part_type_id, supplier_item_no, tier_min, tier_max, unit_price
       )`,
    )
    .eq("service_type_id", serviceType.id)
    .eq("supplier_id", serviceType.default_supplier_id)
    .eq("is_current", true)
    .maybeSingle();

  if (error || !data) {
    // Name the supplier we were told to price against, so the message can say
    // WHICH painter is missing prices rather than just "unavailable".
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("name")
      .eq("id", serviceType.default_supplier_id)
      .maybeSingle();
    return {
      ok: false,
      reason: "default_has_no_list",
      supplierName: supplier?.name ?? null,
    };
  }

  return {
    ok: true,
    list: {
      name: data.name,
      supplierId: one(data.supplier)?.id ?? null,
      supplierName: one(data.supplier)?.name ?? null,
      currency: data.currency,
      items: (data.items ?? []).map((i) => ({
        id: i.id,
        service_part_type_id: i.service_part_type_id,
        supplier_item_no: i.supplier_item_no,
        tier_min: i.tier_min,
        tier_max: i.tier_max,
        unit_price: Number(i.unit_price),
      })),
    },
  };
}

export async function loadTemplatePaintEstimate(
  supabase: SupabaseClient<Database>,
  templateId: string,
): Promise<TemplatePaintEstimate> {
  const empty: TemplatePaintEstimate = {
    rows: [],
    ladder: [],
    totalDkk: null,
    totalLabel: null,
    listLabel: null,
    unpricedCount: 0,
    unavailable: null,
  };

  const { data: paintRows, error } = await supabase
    .from("bike_template_service_parts")
    .select(
      "id, service_part_type_id, quantity, part_type:service_part_types(name_en, name_da, sort_order)",
    )
    .eq("template_id", templateId);
  if (error || !paintRows) return empty;

  const resolution = await loadDefaultPaintList(supabase);
  const list = resolution.ok ? resolution.list : null;
  const unavailable: PaintListUnavailable | null = resolution.ok
    ? null
    : stripOk(resolution);
  const listLabel = list
    ? [list.name, list.supplierName].filter(Boolean).join(" · ")
    : null;

  const forPricing = paintRows.map((r) => ({
    id: r.id,
    service_part_type_id: r.service_part_type_id,
    quantity: r.quantity,
  }));
  const items = list?.items ?? [];
  // ONE bike: the tier every row is priced at, and the total the margin box
  // gets. See the header note — this is the conservative direction on purpose.
  const priced = priceTemplatePerBike(items, forPricing, 1);

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
        partTypeNameDa: partType?.name_da ?? null,
        quantity: r.quantity,
        unitPriceLabel:
          resolved && list
            ? formatPrice(resolved.item.unit_price, list.currency)
            : null,
        lineTotalLabel:
          resolved && list
            ? formatPrice(resolved.perBikeTotal, list.currency)
            : null,
        tierBadge: resolved ? tierLabel(resolved.item) : null,
      };
    });

  const anyPriced = rows.some((r) => r.unitPriceLabel != null);
  const totalLabel =
    anyPriced && list ? formatPrice(priced.perBikeTotal, list.currency) : null;

  // The ladder: price the same declaration at every batch size that changes
  // it, then drop the rungs that don't (a breakpoint on a part type this bike
  // doesn't send much of buys nothing, and a rung showing the same number
  // twice is noise). One surviving rung means flat pricing — show none.
  const ladder: TemplatePaintLadderRung[] = [];
  if (anyPriced && list) {
    const priceByBikes = paintBatchBreakpoints(items, forPricing).map(
      (bikes) => ({
        bikes,
        perBike: priceTemplatePerBike(items, forPricing, bikes).perBikeTotal,
      }),
    );
    const changes = priceByBikes.filter(
      (p, i) => i === 0 || p.perBike !== priceByBikes[i - 1].perBike,
    );
    if (changes.length > 1) {
      for (const [i, c] of changes.entries()) {
        const next = changes[i + 1];
        ladder.push({
          fromBikes: c.bikes,
          toBikes: next ? next.bikes - 1 : null,
          perBikeLabel: formatPrice(c.perBike, list.currency),
        });
      }
    }
  }

  // DKK total for the margin math; ECB conversion for a non-DKK list.
  let totalDkk: number | null = null;
  if (anyPriced && list) {
    if (list.currency === "DKK") {
      totalDkk = priced.perBikeTotal;
    } else {
      const fx = await getOrFetchRate(
        supabase,
        list.currency,
        "DKK",
        new Date().toISOString().slice(0, 10),
      );
      totalDkk = fx ? priced.perBikeTotal * fx.rate : null;
    }
  }

  return {
    rows,
    ladder,
    totalDkk,
    totalLabel,
    listLabel,
    unpricedCount: priced.unpricedCount,
    unavailable,
  };
}
