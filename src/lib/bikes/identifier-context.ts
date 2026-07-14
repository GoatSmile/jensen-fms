/**
 * Shared loader for a bike's identifier context — the active identifier rows,
 * the pickable identifier types (with per-bike-type "required" + "already
 * registered" flags), and the required-completion counts.
 *
 * Mirrors the logic the bike detail page (`/bikes/[id]`) computes inline; the
 * build workbench reuses it to surface frame + identifier entry during the
 * deliberate build (Tier 2) without re-implementing the required/registered
 * bookkeeping.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

export type BikeIdentifierTypeOption = {
  id: string;
  slug: string;
  name_en: string;
  /** Danish vocab name; localize the display via `localizedName` at render. */
  name_da: string | null;
  format_regex: string | null;
  is_required: boolean;
  alreadyRegistered: boolean;
};

export type BikeIdentifierRow = {
  id: string;
  /** English vocab name of the identifier type. */
  typeName: string;
  /** Danish vocab name of the identifier type; localize at render. */
  typeNameDa: string | null;
  typeSlug: string;
  value: string;
};

export type BikeIdentifierContext = {
  /** Pickable types for the add-identifier dialog. */
  types: BikeIdentifierTypeOption[];
  /** Active identifiers already on the bike. */
  rows: BikeIdentifierRow[];
  requiredCount: number;
  requiredRegisteredCount: number;
};

export async function loadBikeIdentifierContext(
  supabase: SupabaseClient<Database>,
  bikeId: string,
  bikeTypeId: string,
): Promise<BikeIdentifierContext> {
  const [identifiersRes, typesRes, requiredRes] = await Promise.all([
    supabase
      .from("bike_identifiers")
      .select(
        "id, identifier_value, is_active, identifier_type:bike_identifier_types(id, slug, name_en, name_da)",
      )
      .eq("bike_id", bikeId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("bike_identifier_types")
      .select("id, slug, name_en, name_da, format_regex")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("bike_type_required_identifiers")
      .select("bike_identifier_type_id, is_required")
      .eq("bike_type_id", bikeTypeId),
  ]);

  const requiredTypes = new Set<string>();
  for (const row of requiredRes.data ?? []) {
    if (row.is_required) requiredTypes.add(row.bike_identifier_type_id);
  }

  const activeTypeIds = new Set(
    (identifiersRes.data ?? [])
      .map((r) => r.identifier_type?.id)
      .filter((x): x is string => x != null),
  );

  const rows: BikeIdentifierRow[] = (identifiersRes.data ?? []).map((r) => ({
    id: r.id,
    typeName: r.identifier_type?.name_en ?? "—",
    typeNameDa: r.identifier_type?.name_da ?? null,
    typeSlug: r.identifier_type?.slug ?? "",
    value: r.identifier_value,
  }));

  const types: BikeIdentifierTypeOption[] = (typesRes.data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    name_en: t.name_en,
    name_da: t.name_da,
    format_regex: t.format_regex,
    is_required: requiredTypes.has(t.id),
    alreadyRegistered: activeTypeIds.has(t.id),
  }));

  const requiredRegisteredCount = [...requiredTypes].filter((id) =>
    activeTypeIds.has(id),
  ).length;

  return {
    types,
    rows,
    requiredCount: requiredTypes.size,
    requiredRegisteredCount,
  };
}
