/**
 * Painted parts are stock (docs/plan-painted-parts.md, DECISIONS 2026-09-02).
 *
 * A painted variant is a PART: `parts.base_part_id` points at the raw part it
 * was painted from and `parts.color_id` says which colour. Variants are created
 * lazily — the first time that base × colour comes back from the painter — so
 * the catalogue grows by the colours the shop actually stocks.
 *
 * Painting is the event that converts raw stock into painted stock. Receiving a
 * stock paint order back posts, per line, a `paint_out` on the base part and a
 * `paint_in` on the variant, the variant's unit cost being the base part's
 * prevailing cost plus the paint price frozen on the line. Both rows name the
 * paint order as their source entity, so the ledger explains itself.
 */

import type { createClient } from "@/lib/supabase/server";
import { resolveUnitCost, outboundCostFields } from "@/lib/inventory/unit-cost";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type VariantResult =
  | { ok: true; variantId: string; created: boolean }
  | { ok: false; error: string };

/** `JP-SL48 B410C` + RAL 1006 → `JP-SL48 B410C-1006`; a RAL-less colour uses its slug. */
export function paintedVariantSku(
  baseSku: string,
  color: { ral_code: string | null; slug: string },
): string {
  const suffix = (color.ral_code?.trim() || color.slug).toUpperCase();
  return `${baseSku}-${suffix}`;
}

/**
 * Find the painted variant of `basePartId` in `colorId`, creating it when it
 * does not exist yet. The base must itself be a raw part (a variant of a
 * variant is refused — repaint resolves to the base in the new colour). The
 * variant inherits category, unit, HS code, origin and paintability from the
 * base; its SKU is the base SKU plus the colour's RAL, its names the base names
 * plus the colour's names.
 */
export async function findOrCreatePaintedVariant(
  supabase: SupabaseServerClient,
  basePartId: string,
  colorId: string,
): Promise<VariantResult> {
  const { data: existing, error: findErr } = await supabase
    .from("parts")
    .select("id")
    .eq("base_part_id", basePartId)
    .eq("color_id", colorId)
    .is("deleted_at", null)
    .maybeSingle();
  if (findErr) return { ok: false, error: findErr.message };
  if (existing) return { ok: true, variantId: existing.id, created: false };

  const [{ data: base, error: baseErr }, { data: color, error: colorErr }] =
    await Promise.all([
      supabase
        .from("parts")
        .select(
          "id, internal_sku, name_en, name_da, description_en, description_da, category_id, unit_of_measure, hs_code_id, origin, service_part_type_id, base_part_id",
        )
        .eq("id", basePartId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("colors")
        .select("id, slug, name_en, name_da, ral_code")
        .eq("id", colorId)
        .maybeSingle(),
    ]);
  if (baseErr || !base)
    return { ok: false, error: baseErr?.message ?? "base part not found" };
  if (colorErr || !color)
    return { ok: false, error: colorErr?.message ?? "colour not found" };
  if (base.base_part_id) {
    return {
      ok: false,
      error: "a painted variant cannot be the base of another variant",
    };
  }

  const { data: created, error: insErr } = await supabase
    .from("parts")
    .insert({
      internal_sku: paintedVariantSku(base.internal_sku, color),
      name_en: `${base.name_en} — ${color.name_en}`,
      name_da: base.name_da
        ? `${base.name_da} — ${color.name_da ?? color.name_en}`
        : null,
      description_en: base.description_en,
      description_da: base.description_da,
      category_id: base.category_id,
      unit_of_measure: base.unit_of_measure,
      hs_code_id: base.hs_code_id,
      origin: base.origin,
      service_part_type_id: base.service_part_type_id,
      base_part_id: base.id,
      color_id: color.id,
    })
    .select("id")
    .single();
  if (insErr || !created) {
    // A concurrent receipt may have created it between our find and insert.
    if (insErr?.code === "23505") {
      const { data: again } = await supabase
        .from("parts")
        .select("id")
        .eq("base_part_id", basePartId)
        .eq("color_id", colorId)
        .maybeSingle();
      if (again) return { ok: true, variantId: again.id, created: false };
    }
    return { ok: false, error: insErr?.message ?? "could not create variant" };
  }
  return { ok: true, variantId: created.id, created: true };
}

export type ConversionLine = {
  /** The raw part named on the paint-order line (or a variant — resolved to its base). */
  partId: string;
  colorId: string;
  quantity: number;
  /** The paint price frozen on the line, per piece, in DKK. Null = unpriced line. */
  paintUnitCostDkk: number | null;
};

export type ConversionResult = {
  converted: number;
  variantsCreated: number;
  /** Lines that could not be converted, with why — the order is still received. */
  failures: { partId: string; error: string }[];
  /** Lines that named no specific part (or no colour), so nothing could convert. */
  skippedNoPart: number;
};

/**
 * Convert raw stock into painted stock for a received-back paint order: one
 * `paint_out` / `paint_in` pair per line. Outbound inherits the base part's
 * prevailing cost (`derived`, like every consumption); inbound is that cost plus
 * the paint price, also `derived` — it was computed, not stated or purchased.
 * Not transactional: a failure leaves earlier lines converted and is reported
 * per line; the order's status is not part of this write.
 */
export async function convertPaintedStock(
  supabase: SupabaseServerClient,
  input: {
    serviceOrderId: string;
    orderNumber: string;
    locationId: string;
    actorId: string | null;
    lines: ConversionLine[];
  },
): Promise<ConversionResult> {
  const result: ConversionResult = {
    converted: 0,
    variantsCreated: 0,
    failures: [],
    skippedNoPart: 0,
  };
  const nowIso = new Date().toISOString();

  for (const line of input.lines) {
    // Repaint: a variant on the line resolves to its base in the new colour.
    const { data: named } = await supabase
      .from("parts")
      .select("id, base_part_id, internal_sku")
      .eq("id", line.partId)
      .maybeSingle();
    if (!named) {
      result.failures.push({ partId: line.partId, error: "part not found" });
      continue;
    }
    const basePartId = named.base_part_id ?? named.id;

    const variant = await findOrCreatePaintedVariant(
      supabase,
      basePartId,
      line.colorId,
    );
    if (!variant.ok) {
      result.failures.push({ partId: line.partId, error: variant.error });
      continue;
    }
    if (variant.created) result.variantsCreated += 1;

    const rawCost = await resolveUnitCost(supabase, named.id);
    const out = outboundCostFields(rawCost);
    const inCost =
      rawCost.costDkk == null && line.paintUnitCostDkk == null
        ? null
        : Math.round(
            ((rawCost.costDkk ?? 0) + (line.paintUnitCostDkk ?? 0)) * 10000,
          ) / 10000;
    const reason = `Painted on ${input.orderNumber}: ${named.internal_sku} → variant · raw ${
      rawCost.costDkk == null ? "?" : rawCost.costDkk
    } + paint ${line.paintUnitCostDkk == null ? "?" : line.paintUnitCostDkk} DKK/unit`;

    const { error: insErr } = await supabase
      .from("inventory_movements")
      .insert([
        {
          part_id: named.id,
          location_id: input.locationId,
          movement_type: "paint_out",
          quantity_delta: -line.quantity,
          ...out,
          source_entity_type: "service_order",
          source_entity_id: input.serviceOrderId,
          reason,
          occurred_at: nowIso,
          created_by: input.actorId,
        },
        {
          part_id: variant.variantId,
          location_id: input.locationId,
          movement_type: "paint_in",
          quantity_delta: line.quantity,
          unit_cost_dkk: inCost,
          unit_cost_basis: inCost == null ? "none" : "derived",
          source_entity_type: "service_order",
          source_entity_id: input.serviceOrderId,
          reason,
          occurred_at: nowIso,
          created_by: input.actorId,
        },
      ]);
    if (insErr) {
      result.failures.push({ partId: line.partId, error: insErr.message });
      continue;
    }
    result.converted += 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Phase 2 — colour-aware build (docs/plan-painted-parts.md §4)
// ---------------------------------------------------------------------------

export type PaintedStockLookup = {
  /** `${basePartId}:${colorId}` → variant part id. Every live variant in the catalogue. */
  variantByBaseColour: Map<string, string>;
  /** part id → base part id for variants (raw parts map to themselves). */
  baseOf: Map<string, string>;
  /** part id → paintable? (true when the part or its base carries a service part type). */
  paintable: Set<string>;
  /** part id → on hand (summed across locations). */
  onHand: Map<string, number>;
};

/**
 * One read of the catalogue's paintable parts and their stock, shared by the
 * recipe swap, finish-build, coverage and the floor queue so they cannot
 * disagree about what a colour has on the shelf.
 */
export async function loadPaintedStockLookup(
  supabase: SupabaseServerClient,
): Promise<PaintedStockLookup> {
  const lookup: PaintedStockLookup = {
    variantByBaseColour: new Map(),
    baseOf: new Map(),
    paintable: new Set(),
    onHand: new Map(),
  };
  const { data: parts } = await supabase
    .from("parts")
    .select("id, base_part_id, color_id, service_part_type_id")
    .not("service_part_type_id", "is", null)
    .is("deleted_at", null);
  const ids: string[] = [];
  for (const p of parts ?? []) {
    lookup.paintable.add(p.id);
    lookup.baseOf.set(p.id, p.base_part_id ?? p.id);
    if (p.base_part_id && p.color_id) {
      lookup.variantByBaseColour.set(`${p.base_part_id}:${p.color_id}`, p.id);
    }
    ids.push(p.id);
  }
  if (ids.length > 0) {
    const { data: stock } = await supabase
      .from("v_current_stock")
      .select("part_id, quantity_on_hand")
      .in("part_id", ids);
    for (const r of stock ?? []) {
      if (!r.part_id) continue;
      lookup.onHand.set(
        r.part_id,
        (lookup.onHand.get(r.part_id) ?? 0) + Number(r.quantity_on_hand ?? 0),
      );
    }
  }
  return lookup;
}

/**
 * Decide which part a paintable requirement should draw from for a bike in
 * `colorId`: the painted variant when it has enough on the shelf, otherwise
 * the raw base with `needsPaint` set. Pure, so coverage and readiness can
 * reason with the same rule. `alreadyClaimed` lets a caller reserve variant
 * stock across several rows (two frames on one MO, or many bikes in a queue).
 */
/**
 * Painted stock in ONE colour, keyed by the RAW recipe part — exactly the map
 * `computeCoverageRows` takes. Pure over an already-loaded lookup so every
 * caller (the MO page, the coverage loader behind the draft-PO action and the
 * spawn prompt) builds it the same way.
 *
 * MEMBERSHIP is the signal: a part outside the map is colour-blind, while a
 * paintable part with no variant in this colour maps to 0 — which is what
 * makes its row read "needs paint" instead of "covered".
 */
export function paintedByPartFor(
  lookup: PaintedStockLookup,
  colorId: string,
  partIds: string[],
): Map<string, number> {
  const painted = new Map<string, number>();
  for (const partId of partIds) {
    if (!lookup.paintable.has(partId)) continue;
    const base = lookup.baseOf.get(partId) ?? partId;
    const variantId = lookup.variantByBaseColour.get(`${base}:${colorId}`);
    painted.set(partId, variantId ? (lookup.onHand.get(variantId) ?? 0) : 0);
  }
  return painted;
}

export function resolvePaintedPick(
  lookup: PaintedStockLookup,
  partId: string,
  qty: number,
  colorId: string | null,
  alreadyClaimed?: Map<string, number>,
): { partId: string; needsPaint: boolean; viaVariant: boolean } {
  if (!lookup.paintable.has(partId) || !colorId) {
    return { partId, needsPaint: false, viaVariant: false };
  }
  const base = lookup.baseOf.get(partId) ?? partId;
  const variant = lookup.variantByBaseColour.get(`${base}:${colorId}`);
  if (variant) {
    const claimed = alreadyClaimed?.get(variant) ?? 0;
    const free = (lookup.onHand.get(variant) ?? 0) - claimed;
    if (free >= qty) {
      alreadyClaimed?.set(variant, claimed + qty);
      return { partId: variant, needsPaint: false, viaVariant: true };
    }
  }
  // No painted stock in this colour: the raw base goes on the list and the
  // row is flagged. A row that already pointed at the variant falls back too —
  // the shelf, not the earlier choice, decides.
  return { partId: base, needsPaint: true, viaVariant: false };
}

export type ApplyVariantsResult = {
  swappedToPainted: number;
  swappedToRaw: number;
  needsPaint: number;
};

/**
 * Re-point a bike's not-yet-consumed `bike_parts` rows at the painted variant
 * in the bike's colour where the shelf has it, and back at the raw base where
 * it does not. Called right after the recipe is copied (so the workbench pick
 * list shows what is physically picked) and again at the top of
 * `finishBikeBuild` (so the shelf at build time, not at copy time, decides).
 * Frozen rows — those with an `inventory_movement_id` — are never touched.
 */
export async function applyPaintedVariantsToBike(
  supabase: SupabaseServerClient,
  bikeId: string,
): Promise<ApplyVariantsResult> {
  const result: ApplyVariantsResult = {
    swappedToPainted: 0,
    swappedToRaw: 0,
    needsPaint: 0,
  };
  const { data: bike } = await supabase
    .from("bikes")
    .select("id, color_id")
    .eq("id", bikeId)
    .maybeSingle();
  if (!bike?.color_id) return result;

  const { data: rows } = await supabase
    .from("bike_parts")
    .select("id, part_id, quantity")
    .eq("bike_id", bikeId)
    .is("removed_at", null)
    .is("inventory_movement_id", null);
  if (!rows || rows.length === 0) return result;

  const lookup = await loadPaintedStockLookup(supabase);
  const claimed = new Map<string, number>();
  for (const row of rows) {
    if (!lookup.paintable.has(row.part_id)) continue;
    const pick = resolvePaintedPick(
      lookup,
      row.part_id,
      Number(row.quantity),
      bike.color_id,
      claimed,
    );
    if (pick.needsPaint) result.needsPaint += 1;
    if (pick.partId === row.part_id) continue;
    const { error } = await supabase
      .from("bike_parts")
      .update({ part_id: pick.partId })
      .eq("id", row.id)
      .is("inventory_movement_id", null);
    if (error) continue;
    if (pick.viaVariant) result.swappedToPainted += 1;
    else result.swappedToRaw += 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Phase 3 — the shelf view: promised and in transit, per part and colour
// ---------------------------------------------------------------------------

export type PaintedDemand = {
  /** `${basePartId}:${colorId}` → units unbuilt bikes on open MOs still require. */
  promised: Map<string, number>;
  /** `${basePartId}:${colorId}` → units on sent / at-supplier paint-order lines. */
  atPainter: Map<string, number>;
};

const OPEN_MO_STATUSES = ["planned", "released", "in_progress", "on_hold"];
const AT_PAINTER_ORDER_STATUSES = ["sent", "at_supplier"];

/**
 * What the painted shelf is already spoken for, and what is on its way back.
 * Promised uses the same requirement rule as the floor queue: a bike whose
 * build has started requires its own not-yet-consumed rows, otherwise its MO's
 * recipe; only paintable parts count, keyed by the RAW base so a row already
 * pointing at the variant and a recipe row for the raw part land on one key.
 * At-painter counts the quantities on lines of sent orders that name a part
 * and a colour — stock frames in transit have no bike, so the line is the only
 * place they exist.
 */
export async function loadPaintedDemand(
  supabase: SupabaseServerClient,
  lookup: PaintedStockLookup,
): Promise<PaintedDemand> {
  const demand: PaintedDemand = { promised: new Map(), atPainter: new Map() };
  const bump = (m: Map<string, number>, key: string, qty: number) =>
    m.set(key, (m.get(key) ?? 0) + qty);

  const { data: bikes } = await supabase
    .from("bikes")
    .select(
      "id, color_id, manufacturing_order_id, mo:manufacturing_orders!manufacturing_order_id(status)",
    )
    .in("status", ["planning", "building"])
    .is("deleted_at", null)
    .not("color_id", "is", null);
  const openBikes = (bikes ?? []).filter((b) => {
    const mo = Array.isArray(b.mo) ? b.mo[0] : b.mo;
    return (
      mo &&
      OPEN_MO_STATUSES.includes(mo.status as string) &&
      b.manufacturing_order_id
    );
  });
  if (openBikes.length > 0) {
    const bikeIds = openBikes.map((b) => b.id);
    const moIds = [
      ...new Set(openBikes.map((b) => b.manufacturing_order_id as string)),
    ];
    const [{ data: rows }, { data: recipe }] = await Promise.all([
      supabase
        .from("bike_parts")
        .select("bike_id, part_id, quantity, inventory_movement_id")
        .in("bike_id", bikeIds)
        .is("removed_at", null),
      supabase
        .from("manufacturing_order_parts")
        .select("manufacturing_order_id, part_id, quantity_per_bike")
        .in("manufacturing_order_id", moIds),
    ]);
    const started = new Set<string>();
    const reqByBike = new Map<string, { partId: string; qty: number }[]>();
    for (const r of rows ?? []) {
      started.add(r.bike_id);
      if (r.inventory_movement_id) continue;
      const list = reqByBike.get(r.bike_id) ?? [];
      list.push({ partId: r.part_id, qty: Number(r.quantity) });
      reqByBike.set(r.bike_id, list);
    }
    const reqByMo = new Map<string, { partId: string; qty: number }[]>();
    for (const r of recipe ?? []) {
      const list = reqByMo.get(r.manufacturing_order_id) ?? [];
      list.push({ partId: r.part_id, qty: Number(r.quantity_per_bike) });
      reqByMo.set(r.manufacturing_order_id, list);
    }
    for (const b of openBikes) {
      const req = started.has(b.id)
        ? (reqByBike.get(b.id) ?? [])
        : (reqByMo.get(b.manufacturing_order_id as string) ?? []);
      for (const r of req) {
        if (!lookup.paintable.has(r.partId)) continue;
        const base = lookup.baseOf.get(r.partId) ?? r.partId;
        bump(demand.promised, `${base}:${b.color_id}`, r.qty);
      }
    }
  }

  const { data: lines } = await supabase
    .from("service_order_items")
    .select(
      "part_id, color_id, quantity, order:service_orders!service_order_id(status, service_type:service_types!service_type_id(blocks_build))",
    )
    .not("part_id", "is", null)
    .not("color_id", "is", null);
  for (const l of lines ?? []) {
    const order = Array.isArray(l.order) ? l.order[0] : l.order;
    if (!order || !AT_PAINTER_ORDER_STATUSES.includes(order.status as string))
      continue;
    const type = Array.isArray(order.service_type)
      ? order.service_type[0]
      : order.service_type;
    if (!type?.blocks_build) continue;
    const base =
      lookup.baseOf.get(l.part_id as string) ?? (l.part_id as string);
    bump(demand.atPainter, `${base}:${l.color_id}`, Number(l.quantity));
  }
  return demand;
}
