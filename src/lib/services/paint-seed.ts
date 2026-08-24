/**
 * "Fill from bikes": turn a paint order's attached bikes into item lines.
 *
 * A template declares what ONE bike sends to the painter
 * (`bike_template_service_parts`). An order sends a batch, in a mix of
 * colours. This groups the first into the second — the tedious, error-prone
 * arithmetic a tech otherwise does from memory for a 20-bike order.
 *
 * It also makes the PRICE right, not just the typing faster: tier basis is
 * the order-wide total per part type, so twenty bikes each sending one frame
 * land the whole order in the 20+ band. Typed by hand, the tier follows
 * whatever was typed.
 *
 * Pure on purpose (same doctrine as `import-tax.ts`) — the grouping is the
 * part worth being able to reason about without a database.
 *
 * Two rules that are easy to get wrong:
 * - Use the bike's OWN template version (`bikes.template_id`), never the
 *   family's current one. Two bikes built from v1 and v2 contribute their own
 *   recipes, which is what history says actually happened.
 * - Colour comes from the BIKE (`bikes.color_id`), never
 *   `service_order_bikes.color_id` — that column is legacy from the pre-items
 *   paint model and would silently shadow the truth.
 */

export type SeedBike = {
  id: string;
  /** null for a bike recorded via /bikes/new — nothing to seed from. */
  templateId: string | null;
  colorId: string | null;
};

export type SeedTemplateRow = {
  templateId: string;
  servicePartTypeId: string;
  /** Per BIKE, guarded below 10 at the template (manage-service-parts.ts). */
  quantity: number;
};

export type SeedLine = {
  servicePartTypeId: string;
  colorId: string | null;
  quantity: number;
};

export type SeedPlan = {
  lines: SeedLine[];
  /** Bikes that contributed at least one line. */
  seededBikes: number;
  /** Attached but recorded outside an MO, so no recipe to expand. */
  bikesWithoutTemplate: number;
  /** On a template that declares no paintwork at all. */
  bikesWithoutPaintwork: number;
  /** Contributed, but their lines carry no colour. */
  bikesWithoutColour: number;
};

/** Stable key for one line: a part type in one colour (null = no colour). */
function lineKey(partTypeId: string, colorId: string | null): string {
  return `${partTypeId}::${colorId ?? ""}`;
}

export function planPaintSeed(
  bikes: SeedBike[],
  templateRows: SeedTemplateRow[],
): SeedPlan {
  const rowsByTemplate = new Map<string, SeedTemplateRow[]>();
  for (const r of templateRows) {
    const list = rowsByTemplate.get(r.templateId) ?? [];
    list.push(r);
    rowsByTemplate.set(r.templateId, list);
  }

  const byLine = new Map<string, SeedLine>();
  let seededBikes = 0;
  let bikesWithoutTemplate = 0;
  let bikesWithoutPaintwork = 0;
  let bikesWithoutColour = 0;

  for (const bike of bikes) {
    if (!bike.templateId) {
      bikesWithoutTemplate += 1;
      continue;
    }
    const rows = rowsByTemplate.get(bike.templateId) ?? [];
    if (rows.length === 0) {
      bikesWithoutPaintwork += 1;
      continue;
    }

    seededBikes += 1;
    if (!bike.colorId) bikesWithoutColour += 1;

    for (const row of rows) {
      if (row.quantity <= 0) continue;
      const key = lineKey(row.servicePartTypeId, bike.colorId);
      const existing = byLine.get(key);
      if (existing) existing.quantity += row.quantity;
      else
        byLine.set(key, {
          servicePartTypeId: row.servicePartTypeId,
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
