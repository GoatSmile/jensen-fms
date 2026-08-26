"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readPersonId } from "@/lib/auth/read-session";
import { createClient } from "@/lib/supabase/server";
import {
  computeStatusFromLines,
  type PurchaseOrderStatus,
} from "@/lib/po/status";

export type LineReceipt = {
  lineId: string;
  /** Number of NEW units arriving in this receive event. Must be > 0. */
  additionalQty: number;
};

export type ReceiveResult = { ok: true } | { ok: false; error: string };

/**
 * Append `received` movements for the given lines, increment each line's
 * received_quantity, and recompute the parent PO's status.
 *
 * Sequential PostgREST ops are used in lieu of a Postgres function. The race
 * window between the movement insert and the line/PO updates is small, and any
 * partial state is recoverable: the line's received_quantity is the source of
 * truth and the next render shows the updated outstanding column.
 */
export async function receivePurchaseOrder(
  poId: string,
  locationId: string,
  receipts: LineReceipt[],
): Promise<ReceiveResult> {
  const t = await getTranslations("errors");
  if (!poId) return { ok: false, error: t("missingPoId") };
  if (!locationId) return { ok: false, error: t("poPickLocation") };
  if (receipts.length === 0) {
    return {
      ok: false,
      error: t("poNoQuantities"),
    };
  }
  for (const r of receipts) {
    if (!Number.isFinite(r.additionalQty) || r.additionalQty <= 0) {
      return {
        ok: false,
        error: t("poReceiveQtyPositive"),
      };
    }
  }

  const supabase = await createClient();

  // Pull the lines being received; we need landed cost + outstanding to validate.
  const { data: lines, error: linesErr } = await supabase
    .from("purchase_order_lines")
    .select(
      "id, part_id, quantity, received_quantity, landed_cost_dkk_per_unit",
    )
    .in(
      "id",
      receipts.map((r) => r.lineId),
    )
    .eq("purchase_order_id", poId);
  if (linesErr) {
    return {
      ok: false,
      error: t("poCouldNotLoadLines", { detail: linesErr.message }),
    };
  }
  if (!lines || lines.length !== receipts.length) {
    return { ok: false, error: t("poLinesNotFound") };
  }

  // Validate over-receipt + unpriced lines before writing anything.
  for (const r of receipts) {
    const line = lines.find((l) => l.id === r.lineId);
    if (!line) {
      return { ok: false, error: t("poUnknownLine", { lineId: r.lineId }) };
    }
    // A line with no price yet has a NULL landed cost; receiving it would stamp
    // a NULL cost basis onto inventory. Block until the price is entered.
    if (line.landed_cost_dkk_per_unit == null) {
      return {
        ok: false,
        error: t("poLineNoPrice"),
      };
    }
    const outstanding = Number(line.quantity) - Number(line.received_quantity);
    if (r.additionalQty > outstanding) {
      return {
        ok: false,
        error: t("poCannotReceiveOverOutstanding", {
          qty: r.additionalQty,
          outstanding,
        }),
      };
    }
  }

  // 1) Append one inventory_movements row per receipt.
  const personId = await readPersonId();
  const movements = receipts.map((r) => {
    const line = lines.find((l) => l.id === r.lineId)!;
    return {
      part_id: line.part_id,
      location_id: locationId,
      movement_type: "received" as const,
      quantity_delta: r.additionalQty,
      unit_cost_dkk: line.landed_cost_dkk_per_unit,
      // Landed cost off the line: FX and the duty buckets already frozen at
      // insert. The only basis that is evidence rather than assertion.
      unit_cost_basis: "purchase" as const,
      source_entity_type: "purchase_order_line",
      source_entity_id: line.id,
      // Who received the goods. Performer and recorder are the same person
      // for a stock move, so one column and no picker (migration 83).
      created_by: personId,
    };
  });
  const { error: insertErr } = await supabase
    .from("inventory_movements")
    .insert(movements);
  if (insertErr) {
    return {
      ok: false,
      error: t("poCouldNotWriteMovements", { detail: insertErr.message }),
    };
  }

  // 2) Bump received_quantity on each line. PostgREST has no `+=`, so we
  //    issue one update per line with the precomputed new total.
  for (const r of receipts) {
    const line = lines.find((l) => l.id === r.lineId)!;
    const newReceived = Number(line.received_quantity) + r.additionalQty;
    const { error: updErr } = await supabase
      .from("purchase_order_lines")
      .update({
        received_quantity: newReceived,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.lineId);
    if (updErr) {
      return {
        ok: false,
        error: t("poLineUpdateFailed", {
          lineId: r.lineId,
          detail: updErr.message,
        }),
      };
    }
  }

  // 3) Recompute PO status from ALL lines (not just the ones in this receipt).
  const { data: allLines, error: allErr } = await supabase
    .from("purchase_order_lines")
    .select("quantity, received_quantity")
    .eq("purchase_order_id", poId);
  if (allErr || !allLines) {
    return {
      ok: false,
      error: t("poCouldNotRecomputeStatus", {
        detail: allErr?.message ?? t("poNoLines"),
      }),
    };
  }

  const { data: poRow, error: poErr } = await supabase
    .from("purchase_orders")
    .select("status, received_date")
    .eq("id", poId)
    .maybeSingle();
  if (poErr || !poRow) {
    return {
      ok: false,
      error: t("poCouldNotLoad", { detail: poErr?.message ?? t("notFound") }),
    };
  }

  const newStatus = computeStatusFromLines(
    poRow.status as PurchaseOrderStatus,
    allLines.map((l) => ({
      quantity: Number(l.quantity),
      received_quantity: Number(l.received_quantity),
    })),
  );

  const setReceivedDate =
    newStatus === "received" && !poRow.received_date
      ? new Date().toISOString().slice(0, 10)
      : poRow.received_date;

  const { error: poUpdErr } = await supabase
    .from("purchase_orders")
    .update({
      status: newStatus,
      received_date: setReceivedDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", poId);
  if (poUpdErr) {
    return {
      ok: false,
      error: t("poCouldNotUpdatePoStatus", { detail: poUpdErr.message }),
    };
  }

  revalidatePath("/parts");
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${poId}`);
  // Each received line touches a part — refresh those detail pages too.
  for (const line of lines) {
    revalidatePath(`/parts/${line.part_id}`);
  }

  return { ok: true };
}
