"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type MOPartsResult = { ok: true } | { ok: false; error: string };

/**
 * Add a part to an MO with origin='added'. Used for parts that aren't in
 * the template recipe but are needed for this specific build.
 */
export async function addMOPart(
  moId: string,
  partId: string,
  qty: number,
): Promise<MOPartsResult> {
  if (!moId || !partId) return { ok: false, error: "Missing MO id or part id." };
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Quantity must be a positive number." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("manufacturing_order_parts").insert({
    manufacturing_order_id: moId,
    part_id: partId,
    quantity_per_bike: qty,
    origin: "added",
  });
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "That part is already in this MO. Edit the existing row instead.",
      };
    }
    return { ok: false, error: `Could not add part: ${error.message}` };
  }
  revalidatePath(`/manufacturing-orders/${moId}`);
  return { ok: true };
}

/**
 * Substitute one part with another on this MO. Removes the original row and
 * inserts the replacement with origin='substituted' and substituted_part_id
 * pointing at the original's part. Per Dennis: substitution is MO-level for
 * v1 — applies to every bike in the MO.
 */
export async function substituteMOPart(
  moId: string,
  originalRowId: string,
  replacementPartId: string,
  qty: number,
): Promise<MOPartsResult> {
  if (!moId || !originalRowId || !replacementPartId) {
    return { ok: false, error: "Missing MO id, original row, or replacement part." };
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Quantity must be a positive number." };
  }

  const supabase = await createClient();
  const { data: original, error: lookupErr } = await supabase
    .from("manufacturing_order_parts")
    .select("part_id, manufacturing_order_id")
    .eq("id", originalRowId)
    .maybeSingle();
  if (lookupErr || !original) {
    return {
      ok: false,
      error: `Could not load original row: ${lookupErr?.message ?? "not found"}`,
    };
  }
  if (original.manufacturing_order_id !== moId) {
    return { ok: false, error: "That row does not belong to this MO." };
  }
  if (original.part_id === replacementPartId) {
    return { ok: false, error: "Replacement is the same as the original." };
  }

  // Insert replacement first so we always have a row even if the delete fails.
  const { error: insErr } = await supabase
    .from("manufacturing_order_parts")
    .insert({
      manufacturing_order_id: moId,
      part_id: replacementPartId,
      quantity_per_bike: qty,
      origin: "substituted",
      substituted_part_id: original.part_id,
    });
  if (insErr) {
    if (insErr.code === "23505") {
      return {
        ok: false,
        error:
          "That replacement part is already on the MO. Substitute against a different part or remove the existing row first.",
      };
    }
    return { ok: false, error: `Could not insert replacement: ${insErr.message}` };
  }

  const { error: delErr } = await supabase
    .from("manufacturing_order_parts")
    .delete()
    .eq("id", originalRowId);
  if (delErr) {
    return {
      ok: false,
      error: `Replacement inserted but the original row didn't delete: ${delErr.message}. The MO now has both — remove the original manually.`,
    };
  }

  revalidatePath(`/manufacturing-orders/${moId}`);
  return { ok: true };
}

/**
 * Update the quantity-per-bike on an MO part row. Allowed for non-template
 * rows; if invoked against a template-origin row we bump its origin to
 * 'modified' so the BOM history makes it clear the qty diverged from the
 * template snapshot.
 */
export async function updateMOPartQuantity(
  moId: string,
  rowId: string,
  qty: number,
): Promise<MOPartsResult> {
  if (!moId || !rowId) return { ok: false, error: "Missing MO id or row id." };
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "Quantity must be a positive number." };
  }

  const supabase = await createClient();
  const { data: row, error: lookupErr } = await supabase
    .from("manufacturing_order_parts")
    .select("origin, manufacturing_order_id, quantity_per_bike")
    .eq("id", rowId)
    .maybeSingle();
  if (lookupErr || !row) {
    return {
      ok: false,
      error: `Could not load row: ${lookupErr?.message ?? "not found"}`,
    };
  }
  if (row.manufacturing_order_id !== moId) {
    return { ok: false, error: "That row does not belong to this MO." };
  }
  if (Number(row.quantity_per_bike) === qty) {
    return { ok: true }; // no-op
  }

  const newOrigin = row.origin === "template" ? "modified" : row.origin;

  const { error: updErr } = await supabase
    .from("manufacturing_order_parts")
    .update({ quantity_per_bike: qty, origin: newOrigin })
    .eq("id", rowId);
  if (updErr) {
    return { ok: false, error: `Could not update qty: ${updErr.message}` };
  }

  revalidatePath(`/manufacturing-orders/${moId}`);
  return { ok: true };
}

/**
 * Remove a part from the MO. Only allowed for non-'template' rows so a
 * mistake on a template-origin row doesn't silently reshape the recipe.
 * If you genuinely need to remove a templated part, save the template as a
 * new version without that part and start a fresh MO from it.
 */
export async function removeMOPart(
  moId: string,
  rowId: string,
): Promise<MOPartsResult> {
  if (!moId || !rowId) return { ok: false, error: "Missing MO id or row id." };

  const supabase = await createClient();
  const { data: row, error: lookupErr } = await supabase
    .from("manufacturing_order_parts")
    .select("origin, manufacturing_order_id")
    .eq("id", rowId)
    .maybeSingle();
  if (lookupErr || !row) {
    return {
      ok: false,
      error: `Could not load row: ${lookupErr?.message ?? "not found"}`,
    };
  }
  if (row.manufacturing_order_id !== moId) {
    return { ok: false, error: "That row does not belong to this MO." };
  }
  if (row.origin === "template") {
    return {
      ok: false,
      error:
        "Cannot remove a template-origin part. Substitute it instead, or save the template as a new version without it.",
    };
  }

  const { error: delErr } = await supabase
    .from("manufacturing_order_parts")
    .delete()
    .eq("id", rowId);
  if (delErr) return { ok: false, error: `Could not remove: ${delErr.message}` };

  revalidatePath(`/manufacturing-orders/${moId}`);
  return { ok: true };
}
