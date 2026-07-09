"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type DeleteTemplateResult = { ok: false; error: string };

/**
 * Hard delete for unreferenced templates — the escape hatch for mis-created
 * or empty ones. Anything with history (bikes, MOs, SO/offer/invoice lines)
 * is blocked with a reason; retiring a real discontinued product is a
 * future archive flag, not a delete. The recipe rows go with the template.
 *
 * If the deleted row was its chain's current version, the newest surviving
 * sibling (same family_id+frame_size, or name_en+frame_size when
 * family-less — the clone-as-version chain rule) is promoted so the chain
 * never ends up headless.
 */
export async function deleteTemplate(
  templateId: string,
): Promise<DeleteTemplateResult | void> {
  if (!templateId) return { ok: false, error: "Missing template id." };

  const supabase = await createClient();

  const { data: t, error: loadErr } = await supabase
    .from("bike_templates")
    .select("id, family_id, name_en, frame_size, is_current")
    .eq("id", templateId)
    .maybeSingle();
  if (loadErr || !t) {
    return {
      ok: false,
      error: `Could not load template: ${loadErr?.message ?? "not found"}`,
    };
  }

  // Reference check — friendly message first; the FK constraints backstop
  // this anyway (a racing insert makes the delete below fail loudly).
  // Soft-deleted bikes still count: their rows still reference the template.
  const head = { count: "exact", head: true } as const;
  const labels = [
    "bike",
    "manufacturing order",
    "sales order line",
    "offer line",
    "invoice line",
  ];
  const counts = await Promise.all([
    supabase.from("bikes").select("id", head).eq("template_id", templateId),
    supabase
      .from("manufacturing_orders")
      .select("id", head)
      .eq("bike_template_id", templateId),
    supabase
      .from("sales_order_lines")
      .select("id", head)
      .eq("bike_template_id", templateId),
    supabase
      .from("offer_lines")
      .select("id", head)
      .eq("bike_template_id", templateId),
    supabase
      .from("invoice_lines")
      .select("id", head)
      .eq("bike_template_id", templateId),
  ]);
  const blockers: string[] = [];
  for (let i = 0; i < counts.length; i++) {
    const res = counts[i];
    if (res.error) {
      return {
        ok: false,
        error: `Could not check references: ${res.error.message}`,
      };
    }
    const n = res.count ?? 0;
    if (n > 0) blockers.push(`${n} ${labels[i]}${n === 1 ? "" : "s"}`);
  }
  if (blockers.length > 0) {
    return {
      ok: false,
      error: `${blockers.join(", ")} reference this template — delete is only for unused templates.`,
    };
  }

  const { error: partsErr } = await supabase
    .from("bike_template_parts")
    .delete()
    .eq("template_id", templateId);
  if (partsErr) {
    return {
      ok: false,
      error: `Could not remove the recipe: ${partsErr.message}`,
    };
  }

  const { error: delErr } = await supabase
    .from("bike_templates")
    .delete()
    .eq("id", templateId);
  if (delErr) {
    return { ok: false, error: `Could not delete: ${delErr.message}` };
  }

  // Keep the version chain headed: promote the newest surviving sibling.
  if (t.is_current) {
    const siblingQuery = supabase
      .from("bike_templates")
      .select("id")
      .eq("frame_size", t.frame_size);
    const siblingScoped = t.family_id
      ? siblingQuery.eq("family_id", t.family_id)
      : siblingQuery.is("family_id", null).eq("name_en", t.name_en);
    const { data: sibling } = await siblingScoped
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sibling) {
      await supabase
        .from("bike_templates")
        .update({ is_current: true })
        .eq("id", sibling.id);
    }
  }

  revalidatePath("/bike-templates");
  redirect("/bike-templates");
}
