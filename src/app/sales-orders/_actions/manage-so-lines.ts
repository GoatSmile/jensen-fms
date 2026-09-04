"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import type { CommercialLineResult } from "@/lib/commercial/lines";
import {
  SALES_ORDER_DOC,
  deleteLine,
  findLineParentId,
  insertLine,
  parseLineFields,
  updateLine,
} from "@/lib/commercial/write-lines";

/**
 * Sales-order lines. The line SHAPE, its validation, its money and the parent
 * total recompute are shared with offers in `src/lib/commercial/` — what stays
 * here is what is true of a SALES ORDER only: lines lock once it leaves
 * `draft`, and a line that already spawned an MO cannot be deleted out from
 * under it.
 */

export type SOLineResult = CommercialLineResult;

type Translator = Awaited<ReturnType<typeof getTranslations>>;

async function assertDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  soId: string,
  t: Translator,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: so } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", soId)
    .maybeSingle();
  if (!so) return { ok: false, error: t("soNotFound") };
  if (so.status !== "draft") {
    return { ok: false, error: t("soLinesLocked", { status: so.status }) };
  }
  return { ok: true };
}

export async function addSOLine(
  soId: string,
  formData: FormData,
): Promise<SOLineResult> {
  const t = await getTranslations("errors");
  if (!soId) return { ok: false, error: t("missingSoId") };

  const parsed = parseLineFields(formData, t);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const guard = await assertDraft(supabase, soId, t);
  if (!guard.ok) return guard;

  const result = await insertLine(
    supabase,
    SALES_ORDER_DOC,
    soId,
    parsed.values,
    t,
  );
  if (!result.ok) return result;

  revalidatePath(`/sales-orders/${soId}`);
  return { ok: true };
}

export async function updateSOLine(
  lineId: string,
  formData: FormData,
): Promise<SOLineResult> {
  const t = await getTranslations("errors");
  if (!lineId) return { ok: false, error: t("missingLineId") };

  const parsed = parseLineFields(formData, t);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const soId = await findLineParentId(supabase, SALES_ORDER_DOC, lineId);
  if (!soId) return { ok: false, error: t("lineNotFound") };

  const guard = await assertDraft(supabase, soId, t);
  if (!guard.ok) return guard;

  const result = await updateLine(
    supabase,
    SALES_ORDER_DOC,
    lineId,
    soId,
    parsed.values,
    t,
  );
  if (!result.ok) return result;

  revalidatePath(`/sales-orders/${soId}`);
  return { ok: true };
}

export async function deleteSOLine(lineId: string): Promise<SOLineResult> {
  const t = await getTranslations("errors");
  if (!lineId) return { ok: false, error: t("missingLineId") };

  const supabase = await createClient();
  const soId = await findLineParentId(supabase, SALES_ORDER_DOC, lineId);
  if (!soId) return { ok: false, error: t("lineNotFound") };

  const guard = await assertDraft(supabase, soId, t);
  if (!guard.ok) return guard;

  // Block delete if a MO was already spawned from this line — the link should
  // be unwound deliberately (cancel the MO first) rather than silently
  // orphaned.
  const { count: linkedMoCount } = await supabase
    .from("manufacturing_orders")
    .select("id", { count: "exact", head: true })
    .eq("sales_order_line_id", lineId);
  if ((linkedMoCount ?? 0) > 0) {
    return {
      ok: false,
      error: t("soCannotDeleteLinkedMo", { count: linkedMoCount ?? 0 }),
    };
  }

  const result = await deleteLine(supabase, SALES_ORDER_DOC, lineId, soId, t);
  if (!result.ok) return result;

  revalidatePath(`/sales-orders/${soId}`);
  return { ok: true };
}
