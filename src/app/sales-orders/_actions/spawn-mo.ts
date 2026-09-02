"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";

import { bulkAddBikesToMO } from "@/app/manufacturing-orders/[id]/_actions/bulk-add-bikes";
import { loadMOCoverage } from "@/lib/manufacturing/coverage";
import { localizedName } from "@/i18n/vocab";
import { createClient } from "@/lib/supabase/server";

export type SpawnMOResult =
  | {
      ok: true;
      moId: string;
      moNumber: string;
      /** Distinct recipe parts with no painted stock in the line's colour. */
      needsPaint: number;
      /** The line's colour, ready to display; null when the line has none. */
      colourLabel: string | null;
    }
  | { ok: false; error: string };

/**
 * Spawn a manufacturing order from a sales order line — aligned with the
 * batch-creation screen so both MO entry paths behave the same: recipe via
 * the `mo_copy_template_parts` RPC, bikes bulk-created up front (auto frame
 * numbers; they inherit the SO's customer slate when the SO is past draft).
 * It does NOT redirect. Dennis asked to be ASKED (call of 1 Sep, 00:27): "they
 * ask you, do you want to create a paint order? because if it's the black and
 * we have it on stock, I just put no." So the action answers that question —
 * how many recipe parts have no painted stock in this line's colour — and the
 * caller either goes straight to the MO or offers the paint order first. The
 * information was always on the MO's coverage panel; what was missing is that
 * nothing asked.
 *
 * Pre-conditions:
 *   - Line must reference a bike_template (not a part).
 *   - SO is `draft` or `confirmed` — spawning during in_production is fine
 *     too (sometimes a customer adds bikes mid-flight) but cancelled /
 *     delivered SOs shouldn't be sprouting new MOs.
 *
 * Mapping:
 *   - target_quantity = line.quantity
 *   - bike_template_id = line.bike_template_id (we pull bike_type_id from
 *     the template, same logic as the existing MO new page)
 *   - color_id = line.color_id (the customer's chosen colour for this line)
 *   - sales_order_id + sales_order_line_id = links back
 *   - status = `planned` (the MO matrix's starting state)
 *
 * v1 is one MO per line. Future "split into two batches" lives in a
 * separate action; the schema already allows N-MOs-per-line.
 */
export async function spawnMOFromSOLine(
  soId: string,
  lineId: string,
): Promise<SpawnMOResult> {
  const t = await getTranslations("errors");
  if (!soId || !lineId) {
    return { ok: false, error: t("soMissingSoOrLineId") };
  }

  const supabase = await createClient();

  const { data: line, error: lineErr } = await supabase
    .from("sales_order_lines")
    .select(
      `id, sales_order_id, bike_template_id, quantity, color_id,
       template:bike_templates!bike_template_id(id, bike_type_id, is_current),
       color:colors!color_id(id, name_en, name_da)`,
    )
    .eq("id", lineId)
    .maybeSingle();
  if (lineErr || !line) {
    return {
      ok: false,
      error: t("soCouldNotLoadLine", {
        detail: lineErr?.message ?? t("notFound"),
      }),
    };
  }
  if (line.sales_order_id !== soId) {
    return { ok: false, error: t("soLineNotOnOrder") };
  }
  if (!line.bike_template_id || !line.template) {
    return {
      ok: false,
      error: t("soOnlyTemplateLinesSpawnMo"),
    };
  }
  if (!line.template.is_current) {
    return {
      ok: false,
      error: t("soTemplateNotCurrent"),
    };
  }
  if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
    return { ok: false, error: t("soLineQtyPositive") };
  }

  const { data: so, error: soErr } = await supabase
    .from("sales_orders")
    .select("id, status, requested_delivery_date, requested_delivery_precision")
    .eq("id", soId)
    .maybeSingle();
  if (soErr || !so) {
    return {
      ok: false,
      error: t("soCouldNotLoad", { detail: soErr?.message ?? t("notFound") }),
    };
  }
  if (so.status === "cancelled" || so.status === "delivered") {
    return {
      ok: false,
      error: t("soCannotSpawnFromStatus", { status: so.status }),
    };
  }

  // Defensive: refuse if a non-cancelled MO already exists for this line.
  // Future "split" lives in its own action.
  const { count: existing } = await supabase
    .from("manufacturing_orders")
    .select("id", { count: "exact", head: true })
    .eq("sales_order_line_id", lineId)
    .neq("status", "cancelled");
  if ((existing ?? 0) > 0) {
    return {
      ok: false,
      error: t("soActiveMoExists"),
    };
  }

  const { data: numberData, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "manufacturing_order" },
  );
  if (numErr || !numberData) {
    return {
      ok: false,
      error: t("soCouldNotAllocateMoNumber", {
        detail: numErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { data: mo, error: moErr } = await supabase
    .from("manufacturing_orders")
    .insert({
      mo_number: numberData,
      status: "planned",
      bike_type_id: line.template.bike_type_id,
      bike_template_id: line.bike_template_id,
      color_id: line.color_id,
      target_quantity: Math.trunc(Number(line.quantity)),
      completed_quantity: 0,
      sales_order_id: soId,
      sales_order_line_id: lineId,
      planned_completion_date: so.requested_delivery_date ?? null,
      planned_completion_precision: so.requested_delivery_precision ?? null,
    })
    .select("id")
    .single();
  if (moErr || !mo) {
    return {
      ok: false,
      error: t("soCouldNotCreateMo", {
        detail: moErr?.message ?? t("unknownError"),
      }),
    };
  }

  // Recipe + bikes, same as the batch screen. Recipe copy soft-fails (the
  // MO detail page supports manual part adds); bike creation failing is
  // surfaced — the MO exists, the user finishes bike setup from its page.
  const { error: copyErr } = await supabase.rpc("mo_copy_template_parts", {
    p_mo_id: mo.id,
  });
  if (copyErr) {
    console.warn(
      `MO ${mo.id} created but template parts copy failed: ${copyErr.message}`,
    );
  }

  const bulk = await bulkAddBikesToMO(mo.id, Math.trunc(Number(line.quantity)));
  if (!bulk.ok) {
    revalidatePath("/sales-orders");
    revalidatePath(`/sales-orders/${soId}`);
    revalidatePath("/manufacturing-orders");
    return {
      ok: false,
      error: t("soMoCreatedBikesFailed", {
        number: numberData,
        detail: bulk.error,
      }),
    };
  }

  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${soId}`);
  revalidatePath("/manufacturing-orders");

  // The paint question, answered with the SAME rule the MO's coverage panel and
  // the floor queue use — a count of parts, not of pieces, so it reads like the
  // badge on the MO ("2 parts need paint"). A coverage failure is not worth
  // failing a created MO over: no count, no prompt, and the MO page will say it.
  let needsPaint = 0;
  const coverage = await loadMOCoverage(supabase, mo.id);
  if (!("error" in coverage)) {
    needsPaint = coverage.rows.filter((r) => r.needsPaint > 0).length;
  }
  const colour = Array.isArray(line.color) ? line.color[0] : line.color;

  return {
    ok: true,
    moId: mo.id,
    moNumber: numberData as string,
    needsPaint,
    colourLabel: colour
      ? localizedName(await getLocale(), colour.name_en, colour.name_da)
      : null,
  };
}
