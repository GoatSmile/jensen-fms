"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type DeleteBikeResult = { ok: true } | { ok: false; error: string };

/**
 * Soft-delete a bike. Distinct from a `retired` lifecycle transition:
 *   - retired (status='retired') = bike reached end-of-life, stays queryable
 *   - deleted (deleted_at set)   = the row was created in error or shouldn't
 *                                  exist at all, hide it from the list
 *
 * For the lifecycle "this bike is now retired" path, use the transition
 * action (Phase 2B.3). This action is for accidental creates only.
 */
export async function deleteBike(bikeId: string): Promise<DeleteBikeResult> {
  if (!bikeId) return { ok: false, error: "Missing bike id." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("bikes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", bikeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}

export async function restoreBike(bikeId: string): Promise<DeleteBikeResult> {
  if (!bikeId) return { ok: false, error: "Missing bike id." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("bikes")
    .update({ deleted_at: null })
    .eq("id", bikeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  return { ok: true };
}
