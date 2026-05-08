"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type RetireResult = { ok: true } | { ok: false; error: string };

/**
 * Soft-delete a part. The list page filters on `deleted_at IS NULL`, so a
 * retired part disappears from browsing but its history (movements,
 * purchases, photos) stays intact and reachable via direct URL.
 */
export async function retirePart(partId: string): Promise<RetireResult> {
  if (!partId) return { ok: false, error: "Missing partId." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", partId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
  return { ok: true };
}

export async function restorePart(partId: string): Promise<RetireResult> {
  if (!partId) return { ok: false, error: "Missing partId." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts")
    .update({ deleted_at: null })
    .eq("id", partId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
  return { ok: true };
}
