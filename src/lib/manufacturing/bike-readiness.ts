/**
 * Build-queue readiness for the unified workshop floor.
 *
 * Surfaces every bike that still needs building (planning/building, on an
 * open MO) and computes, per bike, whether its parts are in stock so the
 * floor can show ready-to-build first and grey out the blocked ones with a
 * reason.
 *
 * A bike's parts requirement is its own `bike_parts` rows once the build has
 * started, otherwise the MO recipe (`manufacturing_order_parts`, one bike's
 * worth). Only the *not-yet-consumed* `bike_parts` count toward the
 * requirement: a row with an `inventory_movement_id` is already in the bike
 * and already deducted from `v_current_stock`, so re-checking it against stock
 * would invent a false shortage (and that's exactly the set `finishBikeBuild`
 * still has left to pull).
 *
 * Like MO coverage, readiness is computed per bike against the FULL on-hand
 * figure — it does NOT model two bikes competing for the same scarce part.
 * Fine at this scale; the planner sees the MO coverage view for the real
 * cross-bike picture. Frame confirmation is NOT a readiness gate: the tech
 * confirms the real frame inside the build workbench, so a provisional-frame
 * bike is still "ready" — the card just flags that a confirmation is pending.
 *
 * A bike physically at the painter (Tier 2 Phase C / D2) CANNOT be built, so
 * `at painter` blocks readiness and TAKES PRECEDENCE over a parts shortfall —
 * the frame literally isn't here, so that's the actionable reason regardless
 * of stock. Receiving its paint order back frees it automatically.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { one } from "@/lib/supabase/embed";
import { loadAtSupplierBikeIds } from "@/lib/services/at-supplier";

export type BuildQueueBike = {
  bikeId: string;
  frameNumber: string;
  frameConfirmed: boolean;
  status: string;
  colorName: string | null;
  colorHex: string | null;
  templateLabel: string | null;
  ownerName: string | null;
  moId: string;
  moNumber: string;
  /** Build-floor labeling note from the bike's MO's sales order (Phase D). */
  buildNote: string | null;
  ready: boolean;
  /** Count of distinct parts short of stock. */
  shortfallCount: number;
  /** Human reason when not ready (null when ready). */
  blockedReason: string | null;
};

const OPEN_MO_STATUSES = ["planned", "released", "in_progress", "on_hold"];

type Req = { partId: string; qty: number };

export async function loadBuildQueue(
  supabase: SupabaseClient<Database>,
): Promise<BuildQueueBike[]> {
  const { data: bikes } = await supabase
    .from("bikes")
    .select(
      `id, frame_number, frame_number_confirmed, status,
       color:colors(name_en, hex),
       bike_template:bike_templates(family:bike_families(name), frame_size),
       owner_organization:organizations!owner_organization_id(
         legal_name, display_name_da, display_name_en
       ),
       manufacturing_order:manufacturing_orders!manufacturing_order_id(
         id, mo_number, status,
         sales_order:sales_orders!sales_order_id(production_note)
       )`,
    )
    .in("status", ["planning", "building"])
    .is("deleted_at", null);

  const openBikes = (bikes ?? []).filter((b) => {
    const mo = one(b.manufacturing_order);
    return mo != null && OPEN_MO_STATUSES.includes(mo.status as string);
  });
  if (openBikes.length === 0) return [];

  const bikeIds = openBikes.map((b) => b.id);
  const moIds = [
    ...new Set(
      openBikes
        .map((b) => one(b.manufacturing_order)?.id as string | undefined)
        .filter((x): x is string => x != null),
    ),
  ];

  const [stockRes, bikePartsRes, recipeRes, atPainterIds] = await Promise.all([
    supabase.from("v_current_stock").select("part_id, quantity_on_hand"),
    supabase
      .from("bike_parts")
      .select(
        "bike_id, part_id, quantity, inventory_movement_id, part:parts!part_id(deleted_at)",
      )
      .in("bike_id", bikeIds)
      .is("removed_at", null),
    supabase
      .from("manufacturing_order_parts")
      .select(
        "manufacturing_order_id, part_id, quantity_per_bike, part:parts!part_id(deleted_at)",
      )
      .in("manufacturing_order_id", moIds),
    loadAtSupplierBikeIds(supabase, bikeIds),
  ]);

  const stockByPart = new Map<string, number>();
  for (const r of stockRes.data ?? []) {
    if (!r.part_id) continue;
    stockByPart.set(
      r.part_id,
      (stockByPart.get(r.part_id) ?? 0) + Number(r.quantity_on_hand ?? 0),
    );
  }

  // Any non-removed bike_parts row means the build has started → the bike's
  // own list governs, not the recipe. But only not-yet-consumed rows still
  // need pulling from stock (consumed rows are already in the bike and already
  // out of v_current_stock), so they alone form the requirement.
  // Soft-deleted parts are skipped from the requirement (same rule as MO
  // coverage): they can't be stocked, so counting them would show a phantom
  // shortage for frozen history rows (e.g. retired JP-lak lines on an open
  // MO recipe). A deleted-part row still marks the build as started.
  const startedBikes = new Set<string>();
  const reqByBike = new Map<string, Req[]>();
  for (const r of bikePartsRes.data ?? []) {
    if (!r.part_id) continue;
    startedBikes.add(r.bike_id);
    if (r.inventory_movement_id != null) continue; // already consumed
    if (one(r.part)?.deleted_at != null) continue;
    const list = reqByBike.get(r.bike_id) ?? [];
    list.push({ partId: r.part_id, qty: Number(r.quantity) });
    reqByBike.set(r.bike_id, list);
  }

  const reqByMo = new Map<string, Req[]>();
  for (const r of recipeRes.data ?? []) {
    if (!r.part_id) continue;
    if (one(r.part)?.deleted_at != null) continue;
    const list = reqByMo.get(r.manufacturing_order_id) ?? [];
    list.push({ partId: r.part_id, qty: Number(r.quantity_per_bike) });
    reqByMo.set(r.manufacturing_order_id, list);
  }

  const result: BuildQueueBike[] = openBikes.map((b) => {
    const mo = one(b.manufacturing_order)!;
    const moId = mo.id as string;
    const color = one(b.color);
    const tpl = one(b.bike_template);
    const owner = one(b.owner_organization);
    const buildNote = one(mo.sales_order)?.production_note ?? null;

    // Own (remaining) parts list once a build has started; else the MO recipe.
    // startedBikes — not reqByBike's presence — is the "started?" signal, so a
    // bike whose parts are all already consumed reads as ready (empty req)
    // instead of wrongly re-checking the full recipe against stock.
    const req = startedBikes.has(b.id)
      ? (reqByBike.get(b.id) ?? [])
      : (reqByMo.get(moId) ?? []);
    let shortfallCount = 0;
    for (const r of req) {
      if ((stockByPart.get(r.partId) ?? 0) < r.qty) shortfallCount += 1;
    }

    // At-painter takes precedence over a parts shortfall: the frame isn't
    // here to build, so that's the reason to surface no matter the stock.
    const atPainter = atPainterIds.has(b.id);
    const ready = !atPainter && shortfallCount === 0;
    const blockedReason = atPainter
      ? "At painter"
      : shortfallCount > 0
        ? `${shortfallCount} part${shortfallCount === 1 ? "" : "s"} short`
        : null;

    return {
      bikeId: b.id,
      frameNumber: b.frame_number,
      frameConfirmed: b.frame_number_confirmed,
      status: b.status as string,
      colorName: color?.name_en ?? null,
      colorHex: color?.hex ?? null,
      templateLabel: tpl
        ? [tpl.family?.name, tpl.frame_size].filter(Boolean).join(" · ")
        : null,
      ownerName:
        owner?.display_name_da ??
        owner?.display_name_en ??
        owner?.legal_name ??
        null,
      moId,
      moNumber: mo.mo_number as string,
      buildNote,
      ready,
      shortfallCount,
      blockedReason,
    };
  });

  // Ready first, then by frame number for a stable order.
  result.sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1;
    return a.frameNumber.localeCompare(b.frameNumber);
  });
  return result;
}
