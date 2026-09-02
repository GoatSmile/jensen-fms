"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type ManageItemResult = { ok: true } | { ok: false; error: string };

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Item lines (part type × qty × colour) are editable only while the order is
 * `planned` — the send transition freezes each line's price snapshot, so a
 * sent order's lines are its cost basis and must not move. Same edit-window
 * rule as PO lines in draft.
 */
async function assertPlanned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceOrderId: string,
  t: Translator,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: order, error } = await supabase
    .from("service_orders")
    .select("id, status")
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (error || !order) {
    return {
      ok: false,
      error: t("paintCouldNotLoadOrder", {
        detail: error?.message ?? t("notFound"),
      }),
    };
  }
  if (order.status !== "planned") {
    return {
      ok: false,
      error: t("paintItemsPlannedOnly", { status: order.status }),
    };
  }
  return { ok: true };
}

/**
 * A line's specific part must be paintable AS the line's part type — a frame
 * line cannot name a fork. Variants are allowed (repaint resolves to the base).
 */
async function assertPartMatchesType(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partId: string,
  servicePartTypeId: string,
  t: Translator,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: part, error } = await supabase
    .from("parts")
    .select("id, service_part_type_id, deleted_at")
    .eq("id", partId)
    .maybeSingle();
  if (error || !part || part.deleted_at) {
    return { ok: false, error: t("paintPartNotFound") };
  }
  if (part.service_part_type_id !== servicePartTypeId) {
    return { ok: false, error: t("paintPartTypeMismatch") };
  }
  return { ok: true };
}

function parseQuantity(
  raw: unknown,
  t: Translator,
): { ok: true; value: number } | { ok: false; error: string } {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: t("paintQtyWholeAboveZero") };
  }
  return { ok: true, value: n };
}

export async function addServiceOrderItem(
  serviceOrderId: string,
  input: {
    servicePartTypeId: string;
    quantity: number;
    colorId?: string | null;
    /** The specific (raw) part this line paints — optional, needed for stock conversion. */
    partId?: string | null;
    notes?: string | null;
  },
): Promise<ManageItemResult> {
  const t = await getTranslations("errors");
  if (!serviceOrderId) return { ok: false, error: t("missingOrderId") };
  if (!input.servicePartTypeId) {
    return { ok: false, error: t("paintPickPartType") };
  }
  const qty = parseQuantity(input.quantity, t);
  if (!qty.ok) return qty;

  const supabase = await createClient();
  const guard = await assertPlanned(supabase, serviceOrderId, t);
  if (!guard.ok) return guard;
  const partId = nullable(input.partId ?? null);
  if (partId) {
    const match = await assertPartMatchesType(supabase, partId, input.servicePartTypeId, t);
    if (!match.ok) return match;
  }

  const { error } = await supabase.from("service_order_items").insert({
    service_order_id: serviceOrderId,
    service_part_type_id: input.servicePartTypeId,
    quantity: qty.value,
    color_id: nullable(input.colorId ?? null),
    part_id: partId,
    notes: nullable(input.notes ?? null),
  });
  if (error) {
    return { ok: false, error: t("paintCouldNotAddItem", { detail: error.message }) };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  return { ok: true };
}

export async function updateServiceOrderItem(
  serviceOrderId: string,
  itemId: string,
  patch: { quantity?: number; colorId?: string | null; partId?: string | null },
): Promise<ManageItemResult> {
  const t = await getTranslations("errors");
  if (!serviceOrderId || !itemId) {
    return { ok: false, error: t("paintMissingOrderOrItem") };
  }

  const update: { quantity?: number; color_id?: string | null; part_id?: string | null } = {};
  if ("quantity" in patch && patch.quantity !== undefined) {
    const qty = parseQuantity(patch.quantity, t);
    if (!qty.ok) return qty;
    update.quantity = qty.value;
  }
  if ("colorId" in patch) update.color_id = patch.colorId || null;
  if ("partId" in patch) update.part_id = patch.partId || null;
  if (Object.keys(update).length === 0) return { ok: true };

  const supabase = await createClient();
  const guard = await assertPlanned(supabase, serviceOrderId, t);
  if (!guard.ok) return guard;
  if (update.part_id) {
    const { data: line } = await supabase
      .from("service_order_items")
      .select("service_part_type_id")
      .eq("id", itemId)
      .eq("service_order_id", serviceOrderId)
      .maybeSingle();
    if (!line) return { ok: false, error: t("paintMissingOrderOrItem") };
    const match = await assertPartMatchesType(supabase, update.part_id, line.service_part_type_id, t);
    if (!match.ok) return match;
  }

  const { error } = await supabase
    .from("service_order_items")
    .update(update)
    .eq("id", itemId)
    .eq("service_order_id", serviceOrderId);
  if (error) {
    return { ok: false, error: t("paintCouldNotUpdateItem", { detail: error.message }) };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  return { ok: true };
}

export async function removeServiceOrderItem(
  serviceOrderId: string,
  itemId: string,
): Promise<ManageItemResult> {
  const t = await getTranslations("errors");
  if (!serviceOrderId || !itemId) {
    return { ok: false, error: t("paintMissingOrderOrItem") };
  }

  const supabase = await createClient();
  const guard = await assertPlanned(supabase, serviceOrderId, t);
  if (!guard.ok) return guard;

  const { error } = await supabase
    .from("service_order_items")
    .delete()
    .eq("id", itemId)
    .eq("service_order_id", serviceOrderId);
  if (error) {
    return { ok: false, error: t("paintCouldNotRemoveItem", { detail: error.message }) };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  return { ok: true };
}
