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
  if (baseErr || !base) return { ok: false, error: baseErr?.message ?? "base part not found" };
  if (colorErr || !color) return { ok: false, error: colorErr?.message ?? "colour not found" };
  if (base.base_part_id) {
    return { ok: false, error: "a painted variant cannot be the base of another variant" };
  }

  const { data: created, error: insErr } = await supabase
    .from("parts")
    .insert({
      internal_sku: paintedVariantSku(base.internal_sku, color),
      name_en: `${base.name_en} — ${color.name_en}`,
      name_da: base.name_da ? `${base.name_da} — ${color.name_da ?? color.name_en}` : null,
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
  const result: ConversionResult = { converted: 0, variantsCreated: 0, failures: [] };
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

    const variant = await findOrCreatePaintedVariant(supabase, basePartId, line.colorId);
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
        : Math.round(((rawCost.costDkk ?? 0) + (line.paintUnitCostDkk ?? 0)) * 10000) / 10000;
    const reason = `Painted on ${input.orderNumber}: ${named.internal_sku} → variant · raw ${
      rawCost.costDkk == null ? "?" : rawCost.costDkk
    } + paint ${line.paintUnitCostDkk == null ? "?" : line.paintUnitCostDkk} DKK/unit`;

    const { error: insErr } = await supabase.from("inventory_movements").insert([
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
