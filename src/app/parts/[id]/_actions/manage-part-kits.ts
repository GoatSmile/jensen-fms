"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type PartKitResult = { ok: true } | { ok: false; error: string };

function revalidate(partId: string, kitId: string) {
  revalidatePath(`/parts/${partId}`);
  revalidatePath("/parts");
  revalidatePath(`/admin/kits/${kitId}`);
  revalidatePath("/admin/kits");
}

export async function addKitToPart(
  partId: string,
  kitId: string,
): Promise<PartKitResult> {
  if (!partId || !kitId) return { ok: false, error: "Missing part or kit." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("part_kits")
    .upsert(
      { part_id: partId, kit_id: kitId },
      { onConflict: "part_id,kit_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: `Could not add label: ${error.message}` };
  revalidate(partId, kitId);
  return { ok: true };
}

export async function removeKitFromPart(
  partId: string,
  kitId: string,
): Promise<PartKitResult> {
  if (!partId || !kitId) return { ok: false, error: "Missing part or kit." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("part_kits")
    .delete()
    .eq("part_id", partId)
    .eq("kit_id", kitId);
  if (error)
    return { ok: false, error: `Could not remove label: ${error.message}` };
  revalidate(partId, kitId);
  return { ok: true };
}
