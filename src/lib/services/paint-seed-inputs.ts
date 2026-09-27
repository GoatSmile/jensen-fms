import type { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import type {
  SeedBike,
  SeedRecipePart,
  SeedTemplateRow,
} from "@/lib/services/paint-seed";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** A paintable part named on a line, for the preview's SKU + name column. */
export type SeedPartInfo = { id: string; sku: string; name: string };

export type PaintSeedInputs = {
  bikes: SeedBike[];
  templateRows: SeedTemplateRow[];
  recipeParts: SeedRecipePart[];
  parts: SeedPartInfo[];
};

type RecipeRow = {
  part_id: string;
  quantity: number;
  part: {
    internal_sku: string;
    name_en: string;
    service_part_type_id: string | null;
    base_part_id: string | null;
    deleted_at: string | null;
  } | null;
};

/**
 * Everything `planPaintSeed` needs for a set of bikes, loaded ONE way.
 *
 * Three screens seed paint lines — the send-to-painter page's preview, the
 * action it submits to, and *Refill from bikes* — and until 2026-09-27 each
 * loaded its own inputs, from the TEMPLATE's recipe, while the MO's coverage
 * read the MO's copy. A part substituted on the MO was invisible to the paint
 * order. One loader, reading the recipe the bike will actually be built from,
 * is what keeps the preview, the order and the MO's "needs paint" count from
 * disagreeing.
 *
 * - A bike on an MO whose recipe has rows expands the MO recipe; otherwise its
 *   template's recipe (an MO whose recipe copy failed still paints sensibly).
 * - Soft-deleted parts are skipped (frozen history is not demand), and so are
 *   parts not marked *Paintable as* — the app has never been told they go.
 * - A painted variant sitting in a recipe resolves to its RAW base: the raw
 *   part is what gets packed for the painter and what `paint_out` consumes.
 */
export async function loadPaintSeedInputs(
  supabase: SupabaseServerClient,
  bikeIds: string[],
): Promise<PaintSeedInputs | { error: string }> {
  const empty: PaintSeedInputs = { bikes: [], templateRows: [], recipeParts: [], parts: [] };
  const ids = [...new Set(bikeIds.filter(Boolean))];
  if (ids.length === 0) return empty;

  const { data: bikeRows, error: bikesErr } = await supabase
    .from("bikes")
    .select("id, template_id, color_id, manufacturing_order_id")
    .in("id", ids);
  if (bikesErr) return { error: bikesErr.message };

  const templateIds = [
    ...new Set((bikeRows ?? []).map((b) => b.template_id).filter((x): x is string => !!x)),
  ];
  const moIds = [
    ...new Set(
      (bikeRows ?? []).map((b) => b.manufacturing_order_id).filter((x): x is string => !!x),
    ),
  ];
  const partCols =
    "internal_sku, name_en, service_part_type_id, base_part_id, deleted_at";

  const [declaredRes, moRecipeRes, tplRecipeRes] = await Promise.all([
    templateIds.length
      ? supabase
          .from("bike_template_service_parts")
          .select("template_id, service_part_type_id, quantity")
          .in("template_id", templateIds)
      : Promise.resolve({ data: [], error: null }),
    moIds.length
      ? supabase
          .from("manufacturing_order_parts")
          .select(`manufacturing_order_id, part_id, quantity_per_bike, part:parts!part_id(${partCols})`)
          .in("manufacturing_order_id", moIds)
      : Promise.resolve({ data: [], error: null }),
    templateIds.length
      ? supabase
          .from("bike_template_parts")
          .select(`template_id, part_id, quantity, part:parts!part_id(${partCols})`)
          .in("template_id", templateIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = declaredRes.error ?? moRecipeRes.error ?? tplRecipeRes.error;
  if (failed) return { error: failed.message };

  const recipeByKey = new Map<string, RecipeRow[]>();
  const push = (key: string, row: RecipeRow) => {
    const list = recipeByKey.get(key) ?? [];
    list.push(row);
    recipeByKey.set(key, list);
  };
  for (const r of (moRecipeRes.data ?? []) as {
    manufacturing_order_id: string;
    part_id: string;
    quantity_per_bike: number;
    part: RecipeRow["part"] | RecipeRow["part"][];
  }[]) {
    push(`mo:${r.manufacturing_order_id}`, {
      part_id: r.part_id,
      quantity: Number(r.quantity_per_bike),
      part: one(r.part),
    });
  }
  for (const r of (tplRecipeRes.data ?? []) as {
    template_id: string;
    part_id: string;
    quantity: number;
    part: RecipeRow["part"] | RecipeRow["part"][];
  }[]) {
    push(`tpl:${r.template_id}`, {
      part_id: r.part_id,
      quantity: Number(r.quantity),
      part: one(r.part),
    });
  }

  // Variants in a recipe → their raw base, with the base's own name + SKU.
  const baseIds = [
    ...new Set(
      [...recipeByKey.values()]
        .flat()
        .map((r) => r.part?.base_part_id)
        .filter((x): x is string => !!x),
    ),
  ];
  const baseInfo = new Map<string, { sku: string; name: string; deleted: boolean }>();
  if (baseIds.length > 0) {
    const { data: bases, error: baseErr } = await supabase
      .from("parts")
      .select("id, internal_sku, name_en, deleted_at")
      .in("id", baseIds);
    if (baseErr) return { error: baseErr.message };
    for (const b of bases ?? []) {
      baseInfo.set(b.id, { sku: b.internal_sku, name: b.name_en, deleted: !!b.deleted_at });
    }
  }

  const recipeParts: SeedRecipePart[] = [];
  const parts = new Map<string, SeedPartInfo>();
  for (const [recipeKey, rows] of recipeByKey) {
    for (const r of rows) {
      const p = r.part;
      if (!p || p.deleted_at || !p.service_part_type_id) continue;
      let partId = r.part_id;
      let info: SeedPartInfo = { id: r.part_id, sku: p.internal_sku, name: p.name_en };
      if (p.base_part_id) {
        const base = baseInfo.get(p.base_part_id);
        if (!base || base.deleted) continue;
        partId = p.base_part_id;
        info = { id: partId, sku: base.sku, name: base.name };
      }
      recipeParts.push({
        recipeKey,
        partId,
        servicePartTypeId: p.service_part_type_id,
        quantityPerBike: r.quantity,
      });
      parts.set(partId, info);
    }
  }

  const bikes: SeedBike[] = (bikeRows ?? []).map((b) => {
    const moKey = b.manufacturing_order_id ? `mo:${b.manufacturing_order_id}` : null;
    const tplKey = b.template_id ? `tpl:${b.template_id}` : null;
    // An MO recipe that exists at all is the one being built, even when none
    // of its parts is paintable — falling back to the template then would
    // paint parts the MO dropped.
    const recipeKey = moKey && recipeByKey.has(moKey) ? moKey : tplKey;
    return {
      id: b.id,
      templateId: b.template_id,
      recipeKey,
      colorId: b.color_id,
    };
  });

  return {
    bikes,
    templateRows: (declaredRes.data ?? []).map((r) => ({
      templateId: r.template_id,
      servicePartTypeId: r.service_part_type_id,
      quantity: r.quantity,
    })),
    recipeParts,
    parts: [...parts.values()],
  };
}
