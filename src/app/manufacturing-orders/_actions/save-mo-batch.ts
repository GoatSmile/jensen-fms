"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

import { bulkAddBikesToMO } from "../[id]/_actions/bulk-add-bikes";

export type BatchRowInput = {
  bike_template_id: string;
  color_id: string;
  quantity: number;
};

export type SaveMOBatchResult = {
  ok: false;
  error: string;
  /** Index of the offending row, when the error is row-specific. */
  rowIndex?: number;
  /** MO numbers already created before the failure — they exist and stay. */
  createdMoNumbers?: string[];
};

const MAX_ROWS = 20;
const MAX_QTY_PER_ROW = 100;

/**
 * Create a production batch: one MO per (template × colour × quantity) row,
 * all sharing the plan dates and notes. When the batch has 2+ MOs, each MO's
 * notes get a "Batch siblings: …" line appended so the link survives without
 * a schema addition. Optionally bulk-creates the bikes on each MO right away
 * (auto frame numbers via the existing bulk-add path).
 *
 * Rows are processed sequentially — MO numbers and frame-number sequences
 * both come from scans that must see the previous row's inserts. A mid-batch
 * failure returns the MOs created so far; they are real and usable.
 */
export async function createManufacturingOrdersBatch(
  formData: FormData,
): Promise<SaveMOBatchResult> {
  const rowsRaw = nullable(formData.get("rows"));
  const planned_start_date = nullable(formData.get("planned_start_date"));
  const planned_completion_date = nullable(
    formData.get("planned_completion_date"),
  );
  const precisionRaw = nullable(formData.get("planned_completion_precision"));
  const planned_completion_precision = !planned_completion_date
    ? null
    : precisionRaw === "week"
      ? "week"
      : "exact";
  const notes = nullable(formData.get("notes"));
  const createBikes = nullable(formData.get("create_bikes")) === "true";

  let rows: BatchRowInput[];
  try {
    const parsed: unknown = JSON.parse(rowsRaw ?? "[]");
    if (!Array.isArray(parsed)) throw new Error("rows must be an array");
    rows = parsed as BatchRowInput[];
  } catch {
    return { ok: false, error: "Could not read the batch rows." };
  }

  if (rows.length === 0) {
    return { ok: false, error: "Add at least one batch row." };
  }
  if (rows.length > MAX_ROWS) {
    return {
      ok: false,
      error: `At most ${MAX_ROWS} MOs per batch. Split it up.`,
    };
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.bike_template_id) {
      return { ok: false, error: "Row is missing a template.", rowIndex: i };
    }
    if (!r.color_id) {
      return {
        ok: false,
        error: "Pick a colour — one MO covers one template and one colour.",
        rowIndex: i,
      };
    }
    if (
      !Number.isFinite(r.quantity) ||
      !Number.isInteger(r.quantity) ||
      r.quantity <= 0
    ) {
      return {
        ok: false,
        error: "Quantity must be a positive whole number.",
        rowIndex: i,
      };
    }
    if (r.quantity > MAX_QTY_PER_ROW) {
      return {
        ok: false,
        error: `At most ${MAX_QTY_PER_ROW} bikes per MO. Split into two rows.`,
        rowIndex: i,
      };
    }
  }

  const supabase = await createClient();

  // Validate all templates up front (exists + current) so a bad row fails
  // the batch before anything is written.
  const templateIds = [...new Set(rows.map((r) => r.bike_template_id))];
  const { data: templates, error: tplErr } = await supabase
    .from("bike_templates")
    .select("id, bike_type_id, is_current")
    .in("id", templateIds);
  if (tplErr) {
    return { ok: false, error: `Could not load templates: ${tplErr.message}` };
  }
  const templateById = new Map((templates ?? []).map((t) => [t.id, t]));
  for (let i = 0; i < rows.length; i++) {
    const tpl = templateById.get(rows[i].bike_template_id);
    if (!tpl) {
      return { ok: false, error: "Template not found.", rowIndex: i };
    }
    if (!tpl.is_current) {
      return {
        ok: false,
        error: "That template is a past version. Pick the current version.",
        rowIndex: i,
      };
    }
  }

  const created: { id: string; mo_number: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const tpl = templateById.get(row.bike_template_id)!;

    const { data: moNumber, error: numErr } = await supabase.rpc(
      "next_document_number",
      { p_doc_type: "manufacturing_order" },
    );
    if (numErr || typeof moNumber !== "string") {
      return {
        ok: false,
        error: `Could not allocate MO number: ${numErr?.message ?? "unknown error"}`,
        rowIndex: i,
        createdMoNumbers: created.map((c) => c.mo_number),
      };
    }

    const { data: mo, error: insErr } = await supabase
      .from("manufacturing_orders")
      .insert({
        mo_number: moNumber,
        bike_template_id: row.bike_template_id,
        bike_type_id: tpl.bike_type_id,
        color_id: row.color_id,
        target_quantity: row.quantity,
        status: "planned",
        planned_start_date,
        planned_completion_date,
        planned_completion_precision,
        notes,
      })
      .select("id")
      .single();
    if (insErr || !mo) {
      return {
        ok: false,
        error: `Could not create MO: ${insErr?.message ?? "unknown error"}`,
        rowIndex: i,
        createdMoNumbers: created.map((c) => c.mo_number),
      };
    }
    created.push({ id: mo.id, mo_number: moNumber });

    const { error: copyErr } = await supabase.rpc("mo_copy_template_parts", {
      p_mo_id: mo.id,
    });
    if (copyErr) {
      // Same soft-fail stance as the single-MO action: the detail page
      // supports manual part adds, so don't abort the batch over it.
      console.warn(
        `MO ${mo.id} created but template parts copy failed: ${copyErr.message}`,
      );
    }

    if (createBikes) {
      const bulk = await bulkAddBikesToMO(mo.id, row.quantity);
      if (!bulk.ok) {
        return {
          ok: false,
          error: `${moNumber} was created but bike creation stopped: ${bulk.error}`,
          rowIndex: i,
          createdMoNumbers: created.map((c) => c.mo_number),
        };
      }
    }
  }

  // Sibling links — only meaningful when the batch produced 2+ MOs.
  if (created.length > 1) {
    for (const mo of created) {
      const siblings = created
        .filter((c) => c.id !== mo.id)
        .map((c) => c.mo_number)
        .join(", ");
      const siblingLine = `Batch siblings: ${siblings}`;
      await supabase
        .from("manufacturing_orders")
        .update({ notes: notes ? `${notes}\n\n${siblingLine}` : siblingLine })
        .eq("id", mo.id);
    }
  }

  revalidatePath("/manufacturing-orders");
  revalidatePath("/bikes");

  if (created.length === 1) {
    redirect(`/manufacturing-orders/${created[0].id}`);
  }
  redirect("/manufacturing-orders");
}
