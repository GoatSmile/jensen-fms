/**
 * The one pricing brain for outsourced services (paint today).
 *
 * A supplier × service type has at most one CURRENT price list revision
 * (`service_price_lists.is_current`); its items carry per-piece prices in
 * qty tiers (tier_max NULL = open top tier). Tier basis is the part type's
 * TOTAL quantity on the order — 4 frames + 12 forks price the frames at the
 * 1–9 tier and the forks at the 10–19 tier (assumed per the painter's own
 * quoting; Dennis asked to confirm). Two lines of the same part type in
 * different colours share one tier.
 *
 * Estimates are LIVE while an order is planned (they track the current
 * list); the send transition freezes supplier_item_no + unit_price +
 * currency + fx_rate_to_dkk onto each service_order_items row — the
 * purchase_order_lines pattern. A new list revision never rewrites a sent
 * order.
 *
 * Used by: the order items editor (live estimate), the send snapshot, and
 * later the template cost-to-paint + the admin price-list grid.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

export type ServicePriceItem = {
  id: string;
  service_part_type_id: string;
  supplier_item_no: string | null;
  tier_min: number;
  tier_max: number | null;
  unit_price: number;
};

export type CurrentPriceList = {
  id: string;
  name: string;
  currency: string;
  effective_from: string | null;
  items: ServicePriceItem[];
};

/** The supplier's current list for a service type; null when none exists. */
export async function loadCurrentPriceList(
  supabase: SupabaseClient<Database>,
  supplierId: string,
  serviceTypeId: string,
): Promise<CurrentPriceList | null> {
  const { data, error } = await supabase
    .from("service_price_lists")
    .select(
      `id, name, currency, effective_from,
       items:service_price_items(
         id, service_part_type_id, supplier_item_no, tier_min, tier_max, unit_price
       )`,
    )
    .eq("supplier_id", supplierId)
    .eq("service_type_id", serviceTypeId)
    .eq("is_current", true)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    currency: data.currency,
    effective_from: data.effective_from,
    items: (data.items ?? []).map((i) => ({
      id: i.id,
      service_part_type_id: i.service_part_type_id,
      supplier_item_no: i.supplier_item_no,
      tier_min: i.tier_min,
      tier_max: i.tier_max,
      unit_price: Number(i.unit_price),
    })),
  };
}

/** The tier row matching `qty` for a part type; null when the list has none. */
export function resolveTierItem(
  items: ServicePriceItem[],
  partTypeId: string,
  qty: number,
): ServicePriceItem | null {
  if (qty <= 0) return null;
  return (
    items.find(
      (i) =>
        i.service_part_type_id === partTypeId &&
        qty >= i.tier_min &&
        (i.tier_max == null || qty <= i.tier_max),
    ) ?? null
  );
}

/** "1–9" / "10–19" / "20+" for the tier badge. */
export function tierLabel(item: ServicePriceItem): string {
  return item.tier_max == null
    ? `${item.tier_min}+`
    : `${item.tier_min}–${item.tier_max}`;
}

export type OrderItemForPricing = {
  id: string;
  service_part_type_id: string;
  quantity: number;
};

export type ResolvedItemPrice = {
  item: ServicePriceItem;
  /** The part type's order-wide qty the tier was resolved against. */
  tierQty: number;
  lineTotal: number;
};

/**
 * Price a set of order items against a list. Tier basis = per-part-type
 * total across the order. Returns per item id the resolved tier row (null =
 * the list has no price for that part type), plus the order total over the
 * priced lines and how many lines could not be priced.
 */
export function priceOrderItems(
  list: Pick<CurrentPriceList, "items">,
  orderItems: OrderItemForPricing[],
): {
  byItemId: Map<string, ResolvedItemPrice | null>;
  total: number;
  unpricedCount: number;
} {
  const qtyByPartType = new Map<string, number>();
  for (const it of orderItems) {
    qtyByPartType.set(
      it.service_part_type_id,
      (qtyByPartType.get(it.service_part_type_id) ?? 0) + it.quantity,
    );
  }

  const byItemId = new Map<string, ResolvedItemPrice | null>();
  let total = 0;
  let unpricedCount = 0;
  for (const it of orderItems) {
    const tierQty = qtyByPartType.get(it.service_part_type_id) ?? it.quantity;
    const resolved = resolveTierItem(
      list.items,
      it.service_part_type_id,
      tierQty,
    );
    if (!resolved) {
      byItemId.set(it.id, null);
      unpricedCount += 1;
      continue;
    }
    const lineTotal = resolved.unit_price * it.quantity;
    total += lineTotal;
    byItemId.set(it.id, { item: resolved, tierQty, lineTotal });
  }
  return { byItemId, total, unpricedCount };
}

export type PerBikeItemPrice = {
  item: ServicePriceItem;
  /** Pieces of this part type a batch of `bikes` sends — the tier basis. */
  tierQty: number;
  /** Cost for ONE bike's worth of this line at that tier. */
  perBikeTotal: number;
};

/**
 * Price a TEMPLATE's paintwork declaration for a batch of `bikes`.
 *
 * Separate from `priceOrderItems` because the two answer different questions
 * and conflating them is what made a template read 20× its own cost. On an
 * order, the quantity IS the pieces going to the painter. On a template, the
 * quantity is per bike, and the pieces — hence the tier — depend on a batch
 * size the template does not know. So the caller states the batch, and the
 * recipe number only ever multiplies.
 */
export function priceTemplatePerBike(
  items: ServicePriceItem[],
  rows: OrderItemForPricing[],
  bikes: number,
): {
  byItemId: Map<string, PerBikeItemPrice | null>;
  perBikeTotal: number;
  unpricedCount: number;
} {
  const byItemId = new Map<string, PerBikeItemPrice | null>();
  let perBikeTotal = 0;
  let unpricedCount = 0;

  // Pieces per part type across the batch — two rows of the same type (which
  // the unique constraint forbids today) would still tier together.
  const piecesByPartType = new Map<string, number>();
  for (const r of rows) {
    piecesByPartType.set(
      r.service_part_type_id,
      (piecesByPartType.get(r.service_part_type_id) ?? 0) + r.quantity * bikes,
    );
  }

  for (const r of rows) {
    const tierQty = piecesByPartType.get(r.service_part_type_id) ?? r.quantity;
    const resolved = resolveTierItem(items, r.service_part_type_id, tierQty);
    if (!resolved) {
      byItemId.set(r.id, null);
      unpricedCount += 1;
      continue;
    }
    const perBike = resolved.unit_price * r.quantity;
    perBikeTotal += perBike;
    byItemId.set(r.id, { item: resolved, tierQty, perBikeTotal: perBike });
  }

  return { byItemId, perBikeTotal, unpricedCount };
}

/**
 * The batch sizes at which this declaration's per-bike cost actually changes.
 *
 * Derived from the list's own tier breakpoints rather than assumed: a
 * breakpoint of 10 PIECES is reached at 5 bikes when a bike sends 2 of that
 * part, so candidates are converted into bike counts before being offered.
 */
export function paintBatchBreakpoints(
  items: ServicePriceItem[],
  rows: OrderItemForPricing[],
): number[] {
  const bikeCounts = new Set<number>([1]);
  for (const r of rows) {
    if (r.quantity <= 0) continue;
    for (const i of items) {
      if (i.service_part_type_id !== r.service_part_type_id) continue;
      bikeCounts.add(Math.max(1, Math.ceil(i.tier_min / r.quantity)));
    }
  }
  return [...bikeCounts].sort((a, b) => a - b);
}
