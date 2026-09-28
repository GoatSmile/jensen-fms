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
  /** Registered as many as the bike needs (one, or one per part — 108). */
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
 * - **How many** of a type follows the PARTS (migration 108): a type that
 *   counts a part category (battery → Batteries) needs one number per unit on
 *   the bike — two batteries, two battery numbers. `needed` defaults to 1, and
 *   `activeCounts` (when given) says how many are registered per type.
 */
export function requiredIdentifierProgress(args: {
  requiredTypes: { id: string; slug: string; needed?: number }[];
  activeTypeIds: Set<string>;
  activeCounts?: Map<string, number>;
  frameProvisional: boolean;
}): { required: number; registered: number } {
  const unique = new Map(args.requiredTypes.map((t) => [t.id, t]));
  let required = 0;
  let registered = 0;
  for (const t of unique.values()) {
    const needed = Math.max(1, t.needed ?? 1);
    required += needed;
    if (t.slug === FRAME_SLUG && args.frameProvisional) continue;
    const have =
      args.activeCounts?.get(t.id) ?? (args.activeTypeIds.has(t.id) ? 1 : 0);
    registered += Math.min(have, needed);
  }
  return { required, registered };
}

/**
 * How many identifiers of each type a bike needs: one, or — for a type that
 * counts a part category — the quantity of that category's parts on the bike
 * (never fewer than one). `partQtyByCategory` is built from the bike's own
 * parts, or its MO recipe before the build has copied them.
 */
export function identifierNeeds(
  types: { id: string; counts_part_category_id: string | null }[],
  partQtyByCategory: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of types) {
    const qty = t.counts_part_category_id
      ? (partQtyByCategory.get(t.counts_part_category_id) ?? 0)
      : 0;
    out.set(t.id, Math.max(1, Math.round(qty)));
  }
  return out;
}

/**
 * Part quantity per category for each bike: its own unremoved `bike_parts`,
 * or — for a bike with none yet — its MO's recipe per bike. One query each.
 */
export async function loadPartQtyByCategory(
  supabase: SupabaseClient<Database>,
  bikes: { id: string; manufacturing_order_id: string | null }[],
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (bikes.length === 0) return out;
  const add = (bikeId: string, cat: string | null | undefined, qty: number) => {
    if (!cat) return;
    const m = out.get(bikeId) ?? new Map<string, number>();
    m.set(cat, (m.get(cat) ?? 0) + qty);
    out.set(bikeId, m);
  };
  const { data: own } = await supabase
    .from("bike_parts")
    .select("bike_id, quantity, part:parts!part_id(category_id)")
    .in(
      "bike_id",
      bikes.map((b) => b.id),
    )
    .is("removed_at", null);
  const withOwn = new Set<string>();
  for (const r of own ?? []) {
    withOwn.add(r.bike_id);
    const part = Array.isArray(r.part) ? r.part[0] : r.part;
    add(r.bike_id, part?.category_id, Number(r.quantity));
  }
  const pending = bikes.filter(
    (b) => !withOwn.has(b.id) && b.manufacturing_order_id,
  );
  const moIds = [...new Set(pending.map((b) => b.manufacturing_order_id!))];
  if (moIds.length > 0) {
    const { data: recipe } = await supabase
      .from("manufacturing_order_parts")
      .select("manufacturing_order_id, quantity_per_bike, part:parts!part_id(category_id)")
      .in("manufacturing_order_id", moIds);
    for (const b of pending) {
      for (const r of recipe ?? []) {
        if (r.manufacturing_order_id !== b.manufacturing_order_id) continue;
        const part = Array.isArray(r.part) ? r.part[0] : r.part;
        add(b.id, part?.category_id, Number(r.quantity_per_bike));
      }
    }
  }
  return out;
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
  manufacturingOrderId: string | null = null,
): Promise<BikeIdentifierContext> {
  const [identifiersRes, typesRes, requiredRes, partQty] = await Promise.all([
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
      .select("id, slug, name_en, name_da, format_regex, counts_part_category_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("bike_type_required_identifiers")
      .select("bike_identifier_type_id, is_required")
      .eq("bike_type_id", bikeTypeId),
    loadPartQtyByCategory(supabase, [
      { id: bikeId, manufacturing_order_id: manufacturingOrderId },
    ]),
  ]);
  const needs = identifierNeeds(
    typesRes.data ?? [],
    partQty.get(bikeId) ?? new Map(),
  );

  const requiredTypes = new Set<string>();
  for (const row of requiredRes.data ?? []) {
    if (row.is_required) requiredTypes.add(row.bike_identifier_type_id);
  }

  const activeTypeIds = new Set(
    (identifiersRes.data ?? [])
      .map((r) => r.identifier_type?.id)
      .filter((x): x is string => x != null),
  );
  const activeCounts = new Map<string, number>();
  for (const r of identifiersRes.data ?? []) {
    const id = r.identifier_type?.id;
    if (id) activeCounts.set(id, (activeCounts.get(id) ?? 0) + 1);
  }

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
    alreadyRegistered: (activeCounts.get(t.id) ?? 0) >= (needs.get(t.id) ?? 1),
  }));

  const progress = requiredIdentifierProgress({
    // Active types only: `types` is the active list, so an archived type that
    // is still flagged required no longer counts against the bike.
    requiredTypes: types
      .filter((t) => t.is_required)
      .map((t) => ({ ...t, needed: needs.get(t.id) ?? 1 })),
    activeTypeIds,
    activeCounts,
    frameProvisional,
  });

  return {
    types,
    rows,
    requiredCount: progress.required,
    requiredRegisteredCount: progress.registered,
  };
}
