"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type AddBikeResult =
  | { ok: true; bikeId: string }
  | { ok: false; error: string; field?: string };

/**
 * Create a bike attached to a manufacturing order. The bike inherits the MO's
 * type, template (if any), and color. Status starts at 'planning'; the user
 * advances it through 'building' to 'in_stock' as the build progresses.
 *
 * The frame number is registered as a bike_identifier so the global UNIQUE
 * constraint catches collisions across all bikes.
 */
export async function addBikeToMO(
  moId: string,
  formData: FormData,
): Promise<AddBikeResult> {
  if (!moId) return { ok: false, error: "Missing MO id." };
  const frame_number = nullable(formData.get("frame_number"));
  const notes = nullable(formData.get("notes"));
  if (!frame_number) {
    return { ok: false, error: "Frame number is required.", field: "frame_number" };
  }

  const supabase = await createClient();

  // Pull the MO so we can copy catalog references onto the bike.
  const { data: mo, error: moErr } = await supabase
    .from("manufacturing_orders")
    .select(
      `id, bike_type_id, bike_template_id, color_id, target_quantity,
       completed_quantity, status, sales_order_id,
       sales_order:sales_orders!sales_order_id(
         id, status, organization_id, organization_unit_id
       )`,
    )
    .eq("id", moId)
    .maybeSingle();
  if (moErr || !mo) {
    return { ok: false, error: `Could not load MO: ${moErr?.message ?? "not found"}` };
  }

  if (mo.status === "completed" || mo.status === "cancelled") {
    return {
      ok: false,
      error: `Cannot add bikes to a ${mo.status} MO.`,
    };
  }

  // Soft cap at target_quantity — Dennis can override by editing target up.
  // We compare against existing non-cancelled bikes attached to the MO.
  const { count: existingBikes } = await supabase
    .from("bikes")
    .select("id", { count: "exact", head: true })
    .eq("manufacturing_order_id", moId)
    .is("deleted_at", null);
  if ((existingBikes ?? 0) >= mo.target_quantity) {
    return {
      ok: false,
      error: `MO already has ${existingBikes} bike${existingBikes === 1 ? "" : "s"} attached. Increase the target quantity to add more.`,
    };
  }

  // If this MO is tied to a confirmed (or further-along) SO, the new bike
  // inherits the SO's customer as a slate. Draft SOs don't slate — they're
  // not commitments yet. Same gate the transitionSO confirm step uses.
  const slate =
    mo.sales_order &&
    mo.sales_order.status !== "draft" &&
    mo.sales_order.status !== "cancelled"
      ? {
          owner_organization_id: mo.sales_order.organization_id,
          owner_unit_id: mo.sales_order.organization_unit_id ?? null,
          assigned_at: new Date().toISOString(),
        }
      : {};

  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .insert({
      bike_type_id: mo.bike_type_id,
      template_id: mo.bike_template_id,
      color_id: mo.color_id,
      manufacturing_order_id: moId,
      frame_number,
      status: "planning",
      notes,
      ...slate,
    })
    .select("id")
    .single();
  if (bikeErr || !bike) {
    if (bikeErr?.code === "23505" && /frame_number/.test(bikeErr.message)) {
      return {
        ok: false,
        error: "That frame number is already on file for another bike.",
        field: "frame_number",
      };
    }
    return {
      ok: false,
      error: `Could not create bike: ${bikeErr?.message ?? "unknown error"}`,
    };
  }

  // Register the frame number as a bike_identifier so cross-bike search hits it.
  const { data: idType } = await supabase
    .from("bike_identifier_types")
    .select("id")
    .eq("slug", "frame_number")
    .maybeSingle();
  if (idType) {
    await supabase.from("bike_identifiers").insert({
      bike_id: bike.id,
      identifier_type_id: idType.id,
      identifier_value: frame_number,
    });
  }

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bike.id}`);
  revalidatePath("/manufacturing-orders");
  revalidatePath(`/manufacturing-orders/${moId}`);
  return { ok: true, bikeId: bike.id };
}
