/**
 * Service-type vocabulary helpers. Surfaces are PER TYPE (owner decision
 * 2026-07-09): /paint-orders is the painting type's surface, permanently; a
 * future washing/sandblasting gets its own nav item + routes rendering the
 * same shared machinery parameterized by service type. The slug is the
 * stable app-side key.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

export const PAINT_SERVICE_SLUG = "painting";

/** The paint surface's supplier noun — "Sent to painter", "At painter". */
export const PAINT_SUPPLIER_NOUN = "painter";

export type ServiceType = {
  id: string;
  slug: string;
  name_en: string;
  name_da: string;
  blocks_build: boolean;
  document_type: string;
  /**
   * The service type's default supplier (migration 67, admin-editable at
   * /admin/services) — pre-selected on new-order forms and used for the
   * template cost estimate. Replaces the old DEFAULT_PAINTER_NAME constant.
   */
  default_supplier_id: string | null;
};

export async function loadServiceTypeBySlug(
  supabase: SupabaseClient<Database>,
  slug: string,
): Promise<ServiceType | null> {
  const { data, error } = await supabase
    .from("service_types")
    .select(
      "id, slug, name_en, name_da, blocks_build, document_type, default_supplier_id",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export type ServicePartType = {
  id: string;
  slug: string;
  name_en: string;
  name_da: string;
  sort_order: number;
};

/** Active part types, picker-ordered. */
export async function loadActiveServicePartTypes(
  supabase: SupabaseClient<Database>,
): Promise<ServicePartType[]> {
  const { data, error } = await supabase
    .from("service_part_types")
    .select("id, slug, name_en, name_da, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });
  if (error || !data) return [];
  return data;
}
