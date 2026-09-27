/**
 * Shared loader for a bike's identifier context — the active identifier rows,
 * the pickable identifier types (with per-bike-type "required" + "already
 * registered" flags), and the required-completion counts.
 *
 * The build workbench uses it to surface frame + identifier entry during the
 * deliberate build (Tier 2); the "N / M required" figure itself comes from
 * `requiredIdentifierProgress`, which every screen shares.
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

const FRAME_SLUG = "frame_number";

/**
 * THE rule for "N / M required identifiers", shared by the bike page, the MO's
 * bike list and the build workbench. On 15 Sep the same bike read 4/4 on the
 * workbench and 4/5 elsewhere: one screen left the frame out, another counted
 * every identifier of any type against every required row, archived types
 * included.
 *
 * - **Required** = the bike type's required identifier types that are still
 *   active — the frame included, because it is required.
 * - **Registered** = those with at least one active identifier — except a
 *   PROVISIONAL frame (`isFrameProvisional`): every MO bike is born with a
 *   generated frame number, which is not a registered identifier.
 */
export function requiredIdentifierProgress(args: {
  requiredTypes: { id: string; slug: string }[];
  activeTypeIds: Set<string>;
  frameProvisional: boolean;
}): { required: number; registered: number } {
  const unique = new Map(args.requiredTypes.map((t) => [t.id, t]));
  let registered = 0;
  for (const t of unique.values()) {
    if (!args.activeTypeIds.has(t.id)) continue;
    if (t.slug === FRAME_SLUG && args.frameProvisional) continue;
    registered += 1;
  }
  return { required: unique.size, registered };
}

/**
 * Is this bike's frame number still the generated placeholder? Only while it
 * is being built and nobody has confirmed it. `frame_number_confirmed` alone
 * cannot say: it defaults to false, and a bike recorded through /bikes/new (or
 * imported) never passes the workbench — its frame is real from the start.
 */
export function isFrameProvisional(status: string, frameConfirmed: boolean): boolean {
  return !frameConfirmed && (status === "planning" || status === "building");
}

export async function loadBikeIdentifierContext(
  supabase: SupabaseClient<Database>,
  bikeId: string,
  bikeTypeId: string,
  frameProvisional: boolean,
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

  const progress = requiredIdentifierProgress({
    // Active types only: `types` is the active list, so an archived type that
    // is still flagged required no longer counts against the bike.
    requiredTypes: types.filter((t) => t.is_required),
    activeTypeIds,
    frameProvisional,
  });

  return {
    types,
    rows,
    requiredCount: progress.required,
    requiredRegisteredCount: progress.registered,
  };
}
