"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type SaveTemplatePartsInput = {
  templateId: string;
  parts: Array<{
    partId: string;
    quantity: number;
    isOptional: boolean;
    notes: string | null;
  }>;
};

export type SaveTemplatePartsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Replace the parts list on a template. Wipes existing rows and inserts the
 * new set in one operation.
 *
 * Atomicity: PostgREST has no transaction primitive, so we do delete-then-
 * insert sequentially. If the insert fails after the delete, the template is
 * temporarily empty. The UI's "Save changes" button is the only caller, and it
 * surfaces errors clearly so the user can re-submit. An RPC is the clean
 * upgrade if this gets noisy.
 */
export async function saveTemplateParts(
  input: SaveTemplatePartsInput,
): Promise<SaveTemplatePartsResult> {
  if (!input.templateId) return { ok: false, error: "Missing template id." };

  for (const p of input.parts) {
    if (!p.partId) return { ok: false, error: "A row is missing its part." };
    if (!Number.isFinite(p.quantity) || p.quantity <= 0) {
      return {
        ok: false,
        error: "Each quantity must be a positive number.",
      };
    }
  }

  // Disallow duplicate part_ids — schema has UNIQUE(template_id, part_id)
  // so the insert would fail anyway, but a friendly error beats a 23505.
  const seen = new Set<string>();
  for (const p of input.parts) {
    if (seen.has(p.partId)) {
      return {
        ok: false,
        error:
          "The same part appears more than once. Combine the rows or remove the duplicate.",
      };
    }
    seen.add(p.partId);
  }

  const supabase = await createClient();

  // Look up the template's model so we can revalidate its detail page too.
  const { data: tpl, error: lookupErr } = await supabase
    .from("bike_templates")
    .select("bike_model_id")
    .eq("id", input.templateId)
    .maybeSingle();
  if (lookupErr || !tpl) {
    return {
      ok: false,
      error: `Could not load template: ${lookupErr?.message ?? "not found"}`,
    };
  }

  const { error: delErr } = await supabase
    .from("bike_template_parts")
    .delete()
    .eq("template_id", input.templateId);
  if (delErr) {
    return { ok: false, error: `Could not clear existing parts: ${delErr.message}` };
  }

  if (input.parts.length > 0) {
    const { error: insErr } = await supabase
      .from("bike_template_parts")
      .insert(
        input.parts.map((p) => ({
          template_id: input.templateId,
          part_id: p.partId,
          quantity: p.quantity,
          is_optional: p.isOptional,
          notes: p.notes,
        })),
      );
    if (insErr) {
      return {
        ok: false,
        error: `Could not write new parts: ${insErr.message}. The template may be temporarily empty — re-submit to retry.`,
      };
    }
  }

  revalidatePath(`/bike-templates/${input.templateId}`);
  revalidatePath(`/bike-models/${tpl.bike_model_id}`);
  return { ok: true };
}
