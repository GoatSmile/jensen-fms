"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type AssignResult = { ok: true } | { ok: false; error: string };

/**
 * Assign a bike to a customer organization (with an optional sub-unit).
 *
 * The same dialog handles two related-but-distinct intents:
 *
 *  1. **Slating during build** (status: planning, building) — earmark this
 *     bike for a known customer so the technician on the floor sees who it's
 *     for. Status stays in its build phase; no transition fires.
 *  2. **Assigning at delivery** (status: in_stock) — the bike is ready and
 *     this is the customer handover. Status advances to `assigned` so the
 *     bike_state_log trigger captures the transition.
 *  3. **Reassigning or transferring** (status: assigned, in_service) — the
 *     customer changed (rare; org merger, internal transfer). Status stays
 *     put, owner pointers refresh, assigned_at restamps so the "current
 *     assignment" timestamp is meaningful.
 *
 * Terminal statuses (retired, lost_or_stolen) and archived bikes block.
 *
 * Use unassignBike() for the reverse (handed back, returned to stock).
 */
export async function assignBikeToCustomer(
  bikeId: string,
  organizationId: string,
  unitId: string | null,
): Promise<AssignResult> {
  if (!bikeId) return { ok: false, error: "Missing bike id." };
  if (!organizationId)
    return { ok: false, error: "Pick a customer to assign the bike to." };

  const supabase = await createClient();

  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id, status")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeErr || !bike) {
    return {
      ok: false,
      error: `Could not load bike: ${bikeErr?.message ?? "not found"}`,
    };
  }

  // Lifecycle gate: terminal/retired statuses block; everything else is
  // either slating (planning/building) or assignment proper (in_stock,
  // assigned, in_service).
  const blockedStatuses = new Set(["retired", "lost_or_stolen"]);
  if (blockedStatuses.has(bike.status)) {
    return {
      ok: false,
      error: `Cannot assign a "${bike.status}" bike — it's out of the active fleet.`,
    };
  }

  // Verify the org exists and is not archived.
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, is_active, deleted_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgErr || !org) {
    return {
      ok: false,
      error: `Could not load customer: ${orgErr?.message ?? "not found"}`,
    };
  }
  if (org.deleted_at != null || !org.is_active) {
    return { ok: false, error: "That customer is archived." };
  }

  // If a unit was picked, make sure it belongs to the org.
  if (unitId) {
    const { data: unit, error: unitErr } = await supabase
      .from("organization_units")
      .select("id, organization_id")
      .eq("id", unitId)
      .maybeSingle();
    if (unitErr || !unit) {
      return {
        ok: false,
        error: `Could not load unit: ${unitErr?.message ?? "not found"}`,
      };
    }
    if (unit.organization_id !== organizationId) {
      return {
        ok: false,
        error: "That unit does not belong to the chosen customer.",
      };
    }
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("bikes")
    .update({
      owner_organization_id: organizationId,
      owner_unit_id: unitId,
      assigned_at: now,
      // Advance to 'assigned' if not already. The trg_bikes_state_log trigger
      // fires on this UPDATE and logs the transition automatically.
      ...(bike.status === "in_stock" ? { status: "assigned" } : {}),
      updated_at: now,
    })
    .eq("id", bikeId);
  if (updErr) {
    return { ok: false, error: `Could not assign: ${updErr.message}` };
  }

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath("/organizations");
  revalidatePath(`/organizations/${organizationId}`);
  return { ok: true };
}

/**
 * Hand the bike back: null the owner pointers and, if currently 'assigned',
 * revert to 'in_stock' so the bike re-enters the available pool. The
 * assigned_at stamp is left in place — it's the most recent customer-out
 * date and useful for warranty calculations later. The state-log trigger
 * captures the assigned→in_stock transition.
 */
export async function unassignBike(bikeId: string): Promise<AssignResult> {
  if (!bikeId) return { ok: false, error: "Missing bike id." };

  const supabase = await createClient();

  const { data: bike, error: bikeErr } = await supabase
    .from("bikes")
    .select("id, status, owner_organization_id")
    .eq("id", bikeId)
    .maybeSingle();
  if (bikeErr || !bike) {
    return {
      ok: false,
      error: `Could not load bike: ${bikeErr?.message ?? "not found"}`,
    };
  }
  if (!bike.owner_organization_id) {
    return { ok: false, error: "Bike has no current customer assignment." };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("bikes")
    .update({
      owner_organization_id: null,
      owner_unit_id: null,
      ...(bike.status === "assigned" ? { status: "in_stock" } : {}),
      updated_at: now,
    })
    .eq("id", bikeId);
  if (updErr) {
    return { ok: false, error: `Could not unassign: ${updErr.message}` };
  }

  revalidatePath("/bikes");
  revalidatePath(`/bikes/${bikeId}`);
  revalidatePath("/organizations");
  revalidatePath(`/organizations/${bike.owner_organization_id}`);
  return { ok: true };
}
