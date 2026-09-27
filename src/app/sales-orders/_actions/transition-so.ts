"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readPersonId } from "@/lib/auth/read-session";
import { resolveDefaultLocationId } from "@/lib/inventory/default-location";
import {
  outboundCostFields,
  resolveUnitCosts,
} from "@/lib/inventory/unit-cost";
import { createClient } from "@/lib/supabase/server";
import type { SOStatus } from "@/lib/so/status";
import { validNextSOStatuses } from "@/lib/so/status";

export type TransitionResult = { ok: true } | { ok: false; error: string };

/**
 * SO status transitions with side-effects on the bike fleet:
 *
 *   draft → confirmed
 *     Slate every bike attached to any linked MO to this SO's customer.
 *     The bikes stay in build phase; the build floor sees who they're
 *     for from day one. (See CLAUDE.md — assignment is overloaded:
 *     slating during build vs. delivery at in_stock.)
 *
 *   ready → delivered
 *     Flip every linked-MO bike that's currently `in_stock` to `assigned`
 *     (their owner is already set from the confirm step). Bikes still in
 *     build phase are left alone — the SO is "delivered" in the sense
 *     that the contract is fulfilled; remaining bikes ship as they
 *     complete.
 *     And every PART line — the extra battery, the spare charger — leaves
 *     stock as a `sold` movement (migration 105). Template lines don't: their
 *     bikes consumed their parts when they were built.
 *
 *   any → cancelled
 *     Unslate any UNBUILT bikes from this SO. Built ones stay slated;
 *     the workshop unpacks the orphan by hand. Reason is appended to
 *     the SO's notes for the audit trail.
 *
 * No-ops on the no-side-effect transitions (confirmed → in_production →
 * ready); status just moves.
 */
export async function transitionSO(
  soId: string,
  to: SOStatus,
  reason: string | null,
): Promise<TransitionResult> {
  const t = await getTranslations("errors");
  if (!soId) return { ok: false, error: t("missingSoId") };

  const supabase = await createClient();
  const { data: so, error: lookupErr } = await supabase
    .from("sales_orders")
    .select(
      "id, sales_order_number, status, organization_id, organization_unit_id, notes",
    )
    .eq("id", soId)
    .maybeSingle();
  if (lookupErr || !so) {
    return {
      ok: false,
      error: t("soCouldNotLoad", {
        detail: lookupErr?.message ?? t("notFound"),
      }),
    };
  }

  const from = so.status as SOStatus;
  if (!validNextSOStatuses(from).includes(to)) {
    return {
      ok: false,
      error: t("soCannotMove", { from, to }),
    };
  }

  // Bikes attached to MOs linked to this SO. Used for the side-effects on
  // confirm / delivered / cancelled.
  async function loadLinkedBikes(): Promise<
    Array<{ id: string; status: string }>
  > {
    const { data: linkedMos } = await supabase
      .from("manufacturing_orders")
      .select("id")
      .eq("sales_order_id", soId);
    const moIds = (linkedMos ?? []).map((m) => m.id);
    if (moIds.length === 0) return [];
    const { data: bikes } = await supabase
      .from("bikes")
      .select("id, status")
      .in("manufacturing_order_id", moIds)
      .is("deleted_at", null);
    return bikes ?? [];
  }

  if (to === "confirmed") {
    const bikes = await loadLinkedBikes();
    // Slate every UNFINISHED bike. Already-built / assigned / in_service /
    // terminal statuses are left alone — they're past the slating window.
    const slatable = bikes.filter(
      (b) => b.status === "planning" || b.status === "building",
    );
    if (slatable.length > 0) {
      const now = new Date().toISOString();
      const { error: slateErr } = await supabase
        .from("bikes")
        .update({
          owner_organization_id: so.organization_id,
          owner_unit_id: so.organization_unit_id,
          assigned_at: now,
          updated_at: now,
        })
        .in(
          "id",
          slatable.map((b) => b.id),
        );
      if (slateErr) {
        return {
          ok: false,
          error: t("soCouldNotSlateBikes", { detail: slateErr.message }),
        };
      }
    }
  }

  if (to === "delivered") {
    // Stock first: if the ledger write fails, nothing else has moved yet.
    const sold = await issueSoldParts(supabase, so.id, so.sales_order_number);
    if (!sold.ok) {
      return {
        ok: false,
        error: t("soCouldNotIssueParts", { detail: sold.error }),
      };
    }

    const bikes = await loadLinkedBikes();
    // Bikes currently in_stock flip to assigned. Bikes still in build phase
    // ship later when they reach in_stock; the slate is already set so
    // their own state-log trigger handles the transition.
    const deliverable = bikes.filter((b) => b.status === "in_stock");
    if (deliverable.length > 0) {
      const now = new Date().toISOString();
      const { error: delErr } = await supabase
        .from("bikes")
        .update({
          status: "assigned",
          assigned_at: now,
          // One bulk UPDATE, so every state-log row it produces names the
          // person who delivered the sales order (migration 84).
          last_actor_id: await readPersonId(),
          updated_at: now,
        })
        .in(
          "id",
          deliverable.map((b) => b.id),
        );
      if (delErr) {
        return {
          ok: false,
          error: t("soCouldNotFlipBikes", { detail: delErr.message }),
        };
      }
    }
  }

  if (to === "cancelled") {
    const bikes = await loadLinkedBikes();
    const unbuilt = bikes.filter(
      (b) => b.status === "planning" || b.status === "building",
    );
    if (unbuilt.length > 0) {
      const now = new Date().toISOString();
      const { error: unslateErr } = await supabase
        .from("bikes")
        .update({
          owner_organization_id: null,
          owner_unit_id: null,
          updated_at: now,
        })
        .in(
          "id",
          unbuilt.map((b) => b.id),
        );
      if (unslateErr) {
        return {
          ok: false,
          error: t("soCouldNotUnslateBikes", { detail: unslateErr.message }),
        };
      }
    }
  }

  // Append cancellation reason to notes for the audit trail.
  const notes = (() => {
    if (to !== "cancelled" || !reason || reason.trim() === "") {
      return so.notes;
    }
    const stamp = `\n\n[Cancelled ${new Date().toISOString().slice(0, 10)}] ${reason.trim()}`;
    return so.notes ? so.notes + stamp : stamp.trimStart();
  })();

  const { error: updErr } = await supabase
    .from("sales_orders")
    .update({
      status: to,
      notes,
      actual_delivery_date:
        to === "delivered" ? new Date().toISOString().slice(0, 10) : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", soId);
  if (updErr) {
    return {
      ok: false,
      error: t("soCouldNotTransition", { detail: updErr.message }),
    };
  }

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${soId}`);
  revalidatePath("/bikes");
  if (to === "delivered") revalidatePath("/parts");
  revalidatePath("/manufacturing-orders");
  return { ok: true };
}

/**
 * Take the SO's part lines off the shelf: one `sold` movement per line, at the
 * prevailing cost (outbound inherits, basis `derived` — never asked). Runs
 * once, on `ready → delivered`, which is terminal. Stock may go below zero:
 * the battery was handed over, and refusing the delivery would only make the
 * books disagree with the van. Soft-deleted parts are still issued for the
 * same reason — a line that was sold was sold.
 */
async function issueSoldParts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  soId: string,
  soNumber: string | null,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { data: lines, error } = await supabase
    .from("sales_order_lines")
    .select("id, part_id, quantity")
    .eq("sales_order_id", soId)
    .not("part_id", "is", null);
  if (error) return { ok: false, error: error.message };
  const partLines = (lines ?? []).filter(
    (l): l is { id: string; part_id: string; quantity: number } =>
      l.part_id != null && Number(l.quantity) > 0,
  );
  if (partLines.length === 0) return { ok: true, count: 0 };

  const [location, costs, personId] = await Promise.all([
    resolveDefaultLocationId(supabase),
    resolveUnitCosts(
      supabase,
      partLines.map((l) => l.part_id),
    ),
    readPersonId(),
  ]);
  if (!location.ok) return { ok: false, error: location.error };

  const { error: insErr } = await supabase.from("inventory_movements").insert(
    partLines.map((l) => ({
      part_id: l.part_id,
      location_id: location.id,
      movement_type: "sold" as const,
      quantity_delta: -Number(l.quantity),
      ...outboundCostFields(costs.get(l.part_id)),
      source_entity_type: "sales_order_line",
      source_entity_id: l.id,
      reason: `Sales order ${soNumber ?? soId}`,
      created_by: personId,
    })),
  );
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, count: partLines.length };
}
