"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type LabelBomResult =
  | { ok: true; labelled: number; already: number }
  | { ok: false; error: string };

/**
 * Bulk convenience: stick one kit label on every part in a template's
 * current BOM. A one-shot writer — labels stay independent of the BOM
 * afterwards (removing a part from the recipe later does NOT unlabel it).
 */
export async function labelTemplateBomWithKit(
  templateId: string,
  kitId: string,
): Promise<LabelBomResult> {
  if (!templateId || !kitId)
    return { ok: false, error: "Missing template or kit." };

  const supabase = await createClient();

  const [bomRes, existingRes] = await Promise.all([
    supabase
      .from("bike_template_parts")
      .select("part_id")
      .eq("template_id", templateId),
    supabase.from("part_kits").select("part_id").eq("kit_id", kitId),
  ]);
  if (bomRes.error)
    return { ok: false, error: `Could not read BOM: ${bomRes.error.message}` };

  const bomPartIds = [...new Set((bomRes.data ?? []).map((r) => r.part_id))];
  if (bomPartIds.length === 0)
    return { ok: false, error: "This template's BOM is empty." };

  const alreadySet = new Set((existingRes.data ?? []).map((r) => r.part_id));
  const fresh = bomPartIds.filter((p) => !alreadySet.has(p));

  if (fresh.length > 0) {
    const { error } = await supabase
      .from("part_kits")
      .insert(fresh.map((part_id) => ({ part_id, kit_id: kitId })));
    if (error)
      return { ok: false, error: `Could not write labels: ${error.message}` };
  }

  revalidatePath(`/bike-templates/${templateId}`);
  revalidatePath("/parts");
  revalidatePath(`/admin/kits/${kitId}`);
  revalidatePath("/admin/kits");
  return {
    ok: true,
    labelled: fresh.length,
    already: bomPartIds.length - fresh.length,
  };
}
