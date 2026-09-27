import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { ilikeEscape } from "@/lib/supabase/ilike";
import { recognitionCodeVariants } from "@/lib/inbound/match";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** How many bikes without an open order the floor's search lists. */
export const WORK_SEARCH_BIKE_LIMIT = 25;

export type WorkSearchBike = {
  id: string;
  frameNumber: string;
  status: string;
  recognitionCode: string | null;
  ownerName: string | null;
  templateLabel: string | null;
};

/**
 * Which bikes does the floor mean by `q`? The phone call starts with the code
 * on the label (BKTM01), a frame number, or just the customer's name, so all
 * three are searched, and the result is ONE set of bike ids:
 *  - frame number, substring;
 *  - any active identifier, substring — plus the exact spoken forms of a
 *    recognition code, because "bktm 1" is not a substring of BKTM01
 *    (`recognitionCodeVariants`, the same rule call matching uses);
 *  - the owner's legal or display name, substring → every bike it owns.
 *
 * Every hit, not the first 1000 (`fetchAllRows`): a customer's name matches
 * hundreds of bikes once the fleet is imported. The set is intersected in
 * memory by the caller, never sent back as an `id.in.(…)` list.
 */
export async function searchWorkBikeIds(
  supabase: Supabase,
  q: string,
): Promise<{ ids: Set<string>; error: string | null }> {
  const needle = q.trim();
  const ids = new Set<string>();
  if (!needle) return { ids, error: null };

  const variants = recognitionCodeVariants(needle);
  const orgNeedle = `%${ilikeEscape(needle)}%`;

  const [frames, identifiers, exactCodes, orgs] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("bikes")
        .select("id")
        .is("deleted_at", null)
        .ilike("frame_number", `%${needle}%`)
        .order("id")
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("bike_identifiers")
        .select("id, bike_id")
        .eq("is_active", true)
        .ilike("identifier_value", `%${needle}%`)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("bike_identifiers")
      .select("bike_id")
      .eq("is_active", true)
      .in("identifier_value", variants),
    supabase
      .from("organizations")
      .select("id")
      .is("deleted_at", null)
      .or(
        `legal_name.ilike.${orgNeedle},display_name_da.ilike.${orgNeedle},display_name_en.ilike.${orgNeedle}`,
      ),
  ]);

  const error =
    frames.error ??
    identifiers.error ??
    exactCodes.error?.message ??
    orgs.error?.message ??
    null;

  for (const r of frames.data) ids.add(r.id);
  for (const r of identifiers.data) ids.add(r.bike_id);
  for (const r of exactCodes.data ?? []) ids.add(r.bike_id);

  const orgIds = (orgs.data ?? []).map((o) => o.id);
  if (orgIds.length > 0) {
    // Org ids are few (a name matches a handful of customers), so this `in`
    // list stays short even when the bikes behind it are many.
    const owned = await fetchAllRows((from, to) =>
      supabase
        .from("bikes")
        .select("id")
        .is("deleted_at", null)
        .in("owner_organization_id", orgIds)
        .order("id")
        .range(from, to),
    );
    for (const r of owned.data) ids.add(r.id);
    if (owned.error && !error) return { ids, error: owned.error };
  }

  return { ids, error };
}

/**
 * Card data for bikes the search found that have NO open work order — the
 * ones the floor may want to start one on. Loads at most `limit` of them, in
 * chunks by id, sorted by recognition code, then frame number.
 */
export async function loadWorkSearchBikes(
  supabase: Supabase,
  bikeIds: string[],
  limit = WORK_SEARCH_BIKE_LIMIT,
): Promise<WorkSearchBike[]> {
  if (bikeIds.length === 0) return [];
  // Offered only bikes that exist as bikes: retired / lost ones cannot take new
  // work, and an unbuilt one (planning / building) is the build queue's, not a
  // repair.
  const CHUNK = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < bikeIds.length; i += CHUNK) {
    chunks.push(bikeIds.slice(i, i + CHUNK));
  }
  const bikeResults = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from("bikes")
        .select(
          `id, frame_number, status,
           bike_template:bike_templates(family:bike_families(name), frame_size),
           owner_organization:organizations!owner_organization_id(
             legal_name, display_name_da, display_name_en
           )`,
        )
        .in("id", ids)
        .is("deleted_at", null)
        .not("status", "in", "(planning,building,retired,lost_or_stolen)"),
    ),
  );
  const codeResults = await Promise.all(
    chunks.map((ids) =>
      supabase
        .from("bike_identifiers")
        .select("bike_id, identifier_value, type:bike_identifier_types!inner(slug)")
        .eq("is_active", true)
        .eq("type.slug", "fleet_number")
        .in("bike_id", ids),
    ),
  );

  const codeByBike = new Map<string, string>();
  for (const res of codeResults) {
    for (const r of res.data ?? []) codeByBike.set(r.bike_id, r.identifier_value);
  }

  const rows: WorkSearchBike[] = [];
  for (const res of bikeResults) {
    for (const b of res.data ?? []) {
      const org = b.owner_organization;
      const tpl = b.bike_template;
      rows.push({
        id: b.id,
        frameNumber: b.frame_number,
        status: b.status,
        recognitionCode: codeByBike.get(b.id) ?? null,
        ownerName:
          org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? null,
        templateLabel: tpl
          ? [tpl.family?.name, tpl.frame_size].filter(Boolean).join(" · ") ||
            null
          : null,
      });
    }
  }

  rows.sort((a, b) => {
    const ac = a.recognitionCode ?? "￿";
    const bc = b.recognitionCode ?? "￿";
    if (ac !== bc) return ac.localeCompare(bc, "da", { numeric: true });
    return a.frameNumber.localeCompare(b.frameNumber, "da", { numeric: true });
  });
  return rows.slice(0, limit);
}
