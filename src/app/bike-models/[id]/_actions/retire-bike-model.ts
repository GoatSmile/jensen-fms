"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type RetireResult = { ok: true } | { ok: false; error: string };

export async function retireBikeModel(modelId: string): Promise<RetireResult> {
  if (!modelId) return { ok: false, error: "Missing model id." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("bike_models")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", modelId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bike-models");
  revalidatePath(`/bike-models/${modelId}`);
  return { ok: true };
}

export async function restoreBikeModel(
  modelId: string,
): Promise<RetireResult> {
  if (!modelId) return { ok: false, error: "Missing model id." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("bike_models")
    .update({ deleted_at: null })
    .eq("id", modelId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/bike-models");
  revalidatePath(`/bike-models/${modelId}`);
  return { ok: true };
}
