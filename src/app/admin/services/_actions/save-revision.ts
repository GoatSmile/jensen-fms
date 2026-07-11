"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { nullableString as nullable } from "@/lib/forms";

export type RevisionItemInput = {
  servicePartTypeId: string;
  tierMin: number;
  tierMax: number | null;
  unitPrice: number;
  supplierItemNo: string | null;
};

export type SaveRevisionInput = {
  supplierId: string;
  serviceTypeId: string;
  name: string;
  currency: string;
  effectiveFrom: string | null;
  items: RevisionItemInput[];
};

export type SaveRevisionResult = { ok: false; error: string };
// On success the action redirect()s back to /admin/services.

/**
 * Publish a new price-list REVISION (the bike_templates versioning pattern:
 * never edit-in-place). Inserts the new list as is_current = false, seeds
 * its items, then flips current-ness atomically via the
 * publish_service_price_list RPC — the partial unique index forbids two
 * current lists, so the swap can't be done in two client calls. Sent orders
 * keep their frozen snapshots; only live estimates follow the new list.
 */
export async function saveServicePriceRevision(
  input: SaveRevisionInput,
): Promise<SaveRevisionResult> {
  if (!input.supplierId) return { ok: false, error: "Pick a supplier." };
  if (!input.serviceTypeId) return { ok: false, error: "Missing service type." };
  const name = input.name?.trim();
  if (!name) {
    return { ok: false, error: "Give the revision a name (e.g. “SIK priser 2027”)." };
  }
  if (!/^[A-Z]{3}$/.test(input.currency ?? "")) {
    return { ok: false, error: "Pick a currency." };
  }
  if (!input.items || input.items.length === 0) {
    return {
      ok: false,
      error: "Fill in at least one price before publishing the revision.",
    };
  }

  // Row-level validation + per-part-type tier overlap. The DB has an
  // exclusion constraint as the backstop; this produces the friendly error.
  const byPartType = new Map<string, RevisionItemInput[]>();
  for (const item of input.items) {
    if (!item.servicePartTypeId) {
      return { ok: false, error: "An item line is missing its part type." };
    }
    if (!Number.isInteger(item.tierMin) || item.tierMin < 1) {
      return { ok: false, error: "Tier boundaries must be whole numbers of 1 or more." };
    }
    if (
      item.tierMax != null &&
      (!Number.isInteger(item.tierMax) || item.tierMax < item.tierMin)
    ) {
      return { ok: false, error: "A tier's upper bound can't sit below its lower bound." };
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      return { ok: false, error: "Prices must be zero or above." };
    }
    const list = byPartType.get(item.servicePartTypeId) ?? [];
    list.push(item);
    byPartType.set(item.servicePartTypeId, list);
  }
  for (const items of byPartType.values()) {
    const sorted = [...items].sort((a, b) => a.tierMin - b.tierMin);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur.tierMax == null || next.tierMin <= cur.tierMax) {
        return {
          ok: false,
          error: `Overlapping quantity tiers (${cur.tierMin}–${cur.tierMax ?? "∞"} and ${next.tierMin}–${next.tierMax ?? "∞"}) on the same part type — tiers must not overlap, or the resolved price would be ambiguous.`,
        };
      }
    }
  }

  const supabase = await createClient();

  // Next revision number in this supplier × service type chain.
  const { data: maxRow, error: maxErr } = await supabase
    .from("service_price_lists")
    .select("version")
    .eq("supplier_id", input.supplierId)
    .eq("service_type_id", input.serviceTypeId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) {
    return { ok: false, error: `Could not look up revisions: ${maxErr.message}` };
  }
  const nextVersion = (maxRow?.version ?? 0) + 1;

  const { data: created, error: insErr } = await supabase
    .from("service_price_lists")
    .insert({
      supplier_id: input.supplierId,
      service_type_id: input.serviceTypeId,
      name,
      currency: input.currency,
      effective_from: nullable(input.effectiveFrom),
      version: nextVersion,
      is_current: false,
    })
    .select("id")
    .single();
  if (insErr || !created) {
    return {
      ok: false,
      error: `Could not create the revision: ${insErr?.message ?? "unknown error"}`,
    };
  }

  const { error: itemsErr } = await supabase.from("service_price_items").insert(
    input.items.map((item) => ({
      price_list_id: created.id,
      service_part_type_id: item.servicePartTypeId,
      tier_min: item.tierMin,
      tier_max: item.tierMax,
      unit_price: item.unitPrice,
      supplier_item_no: nullable(item.supplierItemNo),
    })),
  );
  if (itemsErr) {
    // Roll back the orphan header (cascade removes any partial items) so a
    // retry doesn't burn version numbers on broken revisions.
    await supabase.from("service_price_lists").delete().eq("id", created.id);
    return {
      ok: false,
      error: `Could not save the prices: ${itemsErr.message}`,
    };
  }

  const { error: publishErr } = await supabase.rpc(
    "publish_service_price_list",
    { p_list_id: created.id },
  );
  if (publishErr) {
    await supabase.from("service_price_lists").delete().eq("id", created.id);
    return {
      ok: false,
      error: `Could not publish the revision: ${publishErr.message}`,
    };
  }

  revalidatePath("/admin/services");
  redirect("/admin/services");
}
