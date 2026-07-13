"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { createDraftPOsForDemand } from "@/lib/purchasing/draft-pos";

export type ReorderDraftResult =
  | {
      ok: true;
      pos: { id: string; poNumber: string; supplierName: string; lines: number }[];
      skipped: { sku: string; name: string; reason: string }[];
    }
  | { ok: false; error: string };

/**
 * One part below its reorder point, as shown in the parts-page banner.
 * Server-computed; the action recomputes the same thing (never trusts the
 * client list).
 */
export type ReorderRow = {
  partId: string;
  sku: string;
  name: string;
  onHand: number;
  reorderPoint: number;
  /** What a draft PO would order: reorder_quantity, else top-up to point. */
  orderQty: number;
};

/**
 * Parts whose on-hand stock sits below their reorder point. Quantity to
 * order is the part's `reorder_quantity` when set, else a top-up to the
 * reorder point.
 */
export async function findPartsBelowReorderPoint(): Promise<
  ReorderRow[] | { error: string }
> {
  const t = await getTranslations("errors");
  const supabase = await createClient();
  const [partsRes, stockRes] = await Promise.all([
    supabase
      .from("parts")
      .select("id, internal_sku, name_en, reorder_point, reorder_quantity")
      .not("reorder_point", "is", null)
      .is("deleted_at", null),
    supabase.from("v_current_stock").select("part_id, quantity_on_hand"),
  ]);
  if (partsRes.error) {
    return { error: t("partCouldNotLoadParts", { detail: partsRes.error.message }) };
  }

  const onHandByPart = new Map<string, number>();
  for (const row of stockRes.data ?? []) {
    if (!row.part_id) continue;
    onHandByPart.set(
      row.part_id,
      (onHandByPart.get(row.part_id) ?? 0) + Number(row.quantity_on_hand ?? 0),
    );
  }

  const rows: ReorderRow[] = [];
  for (const p of partsRes.data ?? []) {
    const point = Number(p.reorder_point);
    if (!Number.isFinite(point) || point <= 0) continue;
    const onHand = onHandByPart.get(p.id) ?? 0;
    if (onHand >= point) continue;
    const reorderQty = Number(p.reorder_quantity ?? 0);
    rows.push({
      partId: p.id,
      sku: p.internal_sku,
      name: p.name_en,
      onHand,
      reorderPoint: point,
      orderQty: reorderQty > 0 ? reorderQty : Math.ceil(point - onHand),
    });
  }
  rows.sort(
    (a, b) =>
      a.onHand / a.reorderPoint - b.onHand / b.reorderPoint ||
      a.sku.localeCompare(b.sku),
  );
  return rows;
}

/**
 * Draft purchase orders for every part below its reorder point — one PO
 * per supplier via the shared demand→draft-PO engine. POs stay in draft
 * for review.
 */
export async function draftPOsFromReorderPoints(): Promise<ReorderDraftResult> {
  const t = await getTranslations("errors");
  const supabase = await createClient();

  const below = await findPartsBelowReorderPoint();
  if ("error" in below) return { ok: false, error: below.error };
  if (below.length === 0) {
    return { ok: false, error: t("partNoneBelowReorderPoint") };
  }

  const result = await createDraftPOsForDemand(
    supabase,
    below.map((row) => ({
      partId: row.partId,
      sku: row.sku,
      name: row.name,
      quantity: row.orderQty,
      lineNote: `Reorder point: on hand ${row.onHand}, point ${row.reorderPoint}.`,
    })),
    "Drafted from reorder-point check.",
  );
  if (!result.ok) return result;

  revalidatePath("/purchase-orders");
  revalidatePath("/parts");
  return result;
}
