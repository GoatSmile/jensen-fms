"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  readHasCapability,
  readPersonId,
} from "@/lib/auth/read-session";
import type { FlatCategory } from "@/lib/parts/categories";
import { createClient } from "@/lib/supabase/server";

export type InlinePart = {
  id: string;
  internal_sku: string;
  name_en: string;
  name_da: string | null;
  category_id: string;
};

export type CreatePartInlineResult =
  | { ok: true; part: InlinePart }
  | { ok: false; error: string; field?: string };

/**
 * Create a part from wherever a part is being PICKED — a template recipe, an
 * MO recipe, an order line, a PO line — instead of leaving for /parts/new and
 * coming back. Dennis, 15 Sep (00:25:29): "that's a few steps you have to do
 * to create the parts". The second picker-creates-a-row action after
 * `createColourInline`, and it shares that one's gate helper
 * (`readHasCapability`) rather than copying its check.
 *
 * Takes only what the full form REQUIRES (SKU, English name, category, unit)
 * plus the Danish name. Everything else — prices, supplier, HS code — is the
 * part page's job, one click away afterwards.
 *
 * **Gated on `costs`**, like /parts/new (COSTS_ROUTES): creating a part is
 * catalogue work, and the pickers it hangs off live on pages a technician can
 * open. **"Paintable as" is inherited from the category**, exactly as the full
 * form does it (`service_part_types.default_category_id`) — a part created
 * here must not be the undecided one the generator exists to prevent.
 */
export async function createPartInline(input: {
  internalSku: string;
  nameEn: string;
  nameDa: string | null;
  categoryId: string;
  unitOfMeasure: string | null;
}): Promise<CreatePartInlineResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("costs"))) {
    return { ok: false, error: t("partCreateNeedsCosts") };
  }

  const internal_sku = input.internalSku.trim();
  const name_en = input.nameEn.trim();
  const name_da = input.nameDa?.trim() || null;
  const category_id = input.categoryId.trim();
  const unit_of_measure = input.unitOfMeasure?.trim() || "pcs";
  if (!internal_sku) {
    return { ok: false, error: t("partSkuRequired"), field: "internal_sku" };
  }
  if (!name_en) {
    return { ok: false, error: t("englishNameRequired"), field: "name_en" };
  }
  if (!category_id) {
    return { ok: false, error: t("partCategoryRequired"), field: "category_id" };
  }

  const supabase = await createClient();
  const { data: paintType } = await supabase
    .from("service_part_types")
    .select("id")
    .eq("default_category_id", category_id)
    .eq("is_active", true)
    .maybeSingle();

  const { data, error } = await supabase
    .from("parts")
    .insert({
      last_actor_id: await readPersonId(),
      internal_sku,
      name_en,
      name_da,
      category_id,
      unit_of_measure,
      service_part_type_id: paintType?.id ?? null,
    })
    .select("id, internal_sku, name_en, name_da, category_id")
    .single();

  if (error || !data) {
    if (error?.code === "23505" && /internal_sku/.test(error.message)) {
      return { ok: false, error: t("partSkuInUse"), field: "internal_sku" };
    }
    return {
      ok: false,
      error: t("couldNotCreate", { detail: error?.message ?? t("unknownError") }),
    };
  }

  revalidatePath("/parts");
  return {
    ok: true,
    part: {
      id: data.id,
      internal_sku: data.internal_sku,
      name_en: data.name_en,
      name_da: data.name_da,
      category_id: data.category_id ?? category_id,
    },
  };
}

/**
 * The category list for the quick-create dialog, loaded when it opens — so a
 * host page does not have to thread categories through props it otherwise has
 * no use for (an order line, a PO line).
 */
export async function loadQuickPartCategories(): Promise<FlatCategory[]> {
  if (!(await readHasCapability("costs"))) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("part_categories")
    .select("id, name_en, name_da, parent_id")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });
  return data ?? [];
}
