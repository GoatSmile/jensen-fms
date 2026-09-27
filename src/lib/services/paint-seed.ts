/**
 * "Fill from bikes": turn a paint order's bikes into item lines.
 *
 * A batch of bikes, in a mix of colours, becomes lines of part × colour × qty —
 * the tedious, error-prone arithmetic a tech otherwise does from memory for a
 * 20-bike order.
 *
 * It also makes the PRICE right, not just the typing faster: tier basis is
 * the order-wide total per part type, so twenty bikes each sending one frame
 * land the whole order in the 20+ band. Typed by hand, the tier follows
 * whatever was typed.
 *
 * Pure on purpose (same doctrine as `import-tax.ts`) — the grouping is the
 * part worth being able to reason about without a database. The loading lives
 * in `paint-seed-inputs.ts`, shared by every caller.
 *
 * WHAT GOES TO THE PAINTER (2026-09-27, after the 15 Sep run):
 * - **The RECIPE is the truth.** Every recipe part marked *Paintable as* is a
 *   line, at its recipe quantity, naming the part — the same set the MO's
 *   coverage counts as "needs paint" and readiness blocks on. It used to be the
 *   template's paintwork declaration whenever one existed, so a template that
 *   declared only the frame sent a frame-only order while the MO said "2 parts
 *   need paint" (frame + fork) and the fork never came back painted.
 * - **The declaration fills gaps.** A type the template declares that no recipe
 *   part covers (a cargo bed nobody has marked yet) still goes, by type only —
 *   it can be priced but cannot convert stock, and the screen says so.
 * - **Whose recipe:** the bike's MO recipe when it has one (what will actually
 *   be built — substitutions included), else its template's. The caller encodes
 *   that choice as `recipeKey`.
 *
 * Colour comes from the BIKE (`bikes.color_id`, copied from the sales-order
 * line), never `service_order_bikes.color_id` — that column is legacy from the
 * pre-items paint model and would silently shadow the truth. A caller with a
 * fallback colour for colourless bikes applies it before calling.
 */

export type SeedBike = {
  id: string;
  /** Whose paintwork DECLARATION applies. null for a bike recorded via /bikes/new. */
  templateId: string | null;
  /**
   * Whose RECIPE the bike is built from — `mo:<id>` when its MO has a recipe,
   * else `tpl:<id>`. null = nothing to expand.
   */
  recipeKey: string | null;
  colorId: string | null;
};

export type SeedTemplateRow = {
  templateId: string;
  servicePartTypeId: string;
  /** Per BIKE, guarded below 10 at the template (manage-service-parts.ts). */
  quantity: number;
};

/** A recipe part that is paintable as some service part type. */
export type SeedRecipePart = {
  recipeKey: string;
  /** The RAW part — a painted variant in a recipe is resolved to its base. */
  partId: string;
  servicePartTypeId: string;
  quantityPerBike: number;
};

export type SeedLine = {
  servicePartTypeId: string;
  colorId: string | null;
  quantity: number;
  /**
   * The specific recipe part (docs/plan-painted-parts.md, phase 4) — what lets
   * the line convert raw into painted stock when the order comes back. Null for
   * a declared type no recipe part covers.
   */
  partId: string | null;
};

export type SeedPlan = {
  lines: SeedLine[];
  /** Bikes that contributed at least one line. */
  seededBikes: number;
  /** Attached but recorded outside an MO, so no recipe to expand. */
  bikesWithoutTemplate: number;
  /** Nothing in the recipe is marked paintable and the template declares nothing. */
  bikesWithoutPaintwork: number;
  /** Contributed, but their lines carry no colour. */
  bikesWithoutColour: number;
};

/** Stable key for one line: a part type, a specific part (or none), one colour. */
export function paintLineKey(
  partTypeId: string,
  partId: string | null,
  colorId: string | null,
): string {
  return `${partTypeId}::${partId ?? ""}::${colorId ?? ""}`;
}

export function planPaintSeed(
  bikes: SeedBike[],
  templateRows: SeedTemplateRow[],
  recipeParts: SeedRecipePart[] = [],
): SeedPlan {
  const declaredByTemplate = new Map<string, SeedTemplateRow[]>();
  for (const r of templateRows) {
    const list = declaredByTemplate.get(r.templateId) ?? [];
    list.push(r);
    declaredByTemplate.set(r.templateId, list);
  }
  // recipe → its paintable parts, one entry per part (a recipe names a part
  // once; summing guards a caller that hands in duplicates).
  const recipeByKey = new Map<string, Map<string, SeedRecipePart>>();
  for (const rp of recipeParts) {
    const parts = recipeByKey.get(rp.recipeKey) ?? new Map<string, SeedRecipePart>();
    const existing = parts.get(rp.partId);
    if (existing) existing.quantityPerBike += rp.quantityPerBike;
    else parts.set(rp.partId, { ...rp });
    recipeByKey.set(rp.recipeKey, parts);
  }

  const byLine = new Map<string, SeedLine>();
  const add = (line: SeedLine) => {
    if (line.quantity <= 0) return;
    const key = paintLineKey(line.servicePartTypeId, line.partId, line.colorId);
    const existing = byLine.get(key);
    if (existing) existing.quantity += line.quantity;
    else byLine.set(key, { ...line });
  };

  let seededBikes = 0;
  let bikesWithoutTemplate = 0;
  let bikesWithoutPaintwork = 0;
  let bikesWithoutColour = 0;

  for (const bike of bikes) {
    if (!bike.templateId && !bike.recipeKey) {
      bikesWithoutTemplate += 1;
      continue;
    }
    const recipe = [
      ...(bike.recipeKey ? (recipeByKey.get(bike.recipeKey)?.values() ?? []) : []),
    ].filter((rp) => rp.quantityPerBike > 0);
    const coveredTypes = new Set(recipe.map((rp) => rp.servicePartTypeId));
    const gaps = (bike.templateId ? (declaredByTemplate.get(bike.templateId) ?? []) : [])
      .filter((row) => row.quantity > 0 && !coveredTypes.has(row.servicePartTypeId));

    if (recipe.length === 0 && gaps.length === 0) {
      bikesWithoutPaintwork += 1;
      continue;
    }
    seededBikes += 1;
    if (!bike.colorId) bikesWithoutColour += 1;

    for (const rp of recipe) {
      add({
        servicePartTypeId: rp.servicePartTypeId,
        partId: rp.partId,
        colorId: bike.colorId,
        quantity: rp.quantityPerBike,
      });
    }
    for (const row of gaps) {
      add({
        servicePartTypeId: row.servicePartTypeId,
        partId: null,
        colorId: bike.colorId,
        quantity: row.quantity,
      });
    }
  }

  return {
    lines: [...byLine.values()],
    seededBikes,
    bikesWithoutTemplate,
    bikesWithoutPaintwork,
    bikesWithoutColour,
  };
}

/**
 * The starter lines for a batch where nothing is marked or declared: one line
 * per fallback part type (frame + fork) PER COLOUR, by type only. Shared by the
 * create action and its preview so the two cannot disagree — and per colour
 * because a two-colour batch collapsed into one colour is how six bikes came
 * back "all yellow" on 15 Sep.
 */
export function fallbackStarterLines(
  bikes: SeedBike[],
  fallbackPartTypeIds: string[],
): SeedLine[] {
  const bikesByColour = new Map<string | null, number>();
  for (const b of bikes) {
    bikesByColour.set(b.colorId, (bikesByColour.get(b.colorId) ?? 0) + 1);
  }
  const lines: SeedLine[] = [];
  for (const [colorId, count] of bikesByColour) {
    for (const partTypeId of fallbackPartTypeIds) {
      lines.push({ servicePartTypeId: partTypeId, partId: null, colorId, quantity: count });
    }
  }
  return lines;
}

/**
 * The one colour every line shares, or null when they differ (or none has one).
 * `service_orders.color_id` is a header convenience — the lines are the truth —
 * so a mixed batch leaves it empty rather than naming whichever came first.
 */
export function sharedLineColour(lines: { colorId: string | null }[]): string | null {
  const colours = new Set(lines.map((l) => l.colorId));
  if (colours.size !== 1) return null;
  return [...colours][0] ?? null;
}
