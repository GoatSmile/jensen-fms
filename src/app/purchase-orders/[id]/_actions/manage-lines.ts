"use server";

import { revalidatePath } from "next/cache";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  recomputePOTotal,
  resolveAntiDumpingPctForPart,
  resolveTariffPctForPart,
} from "@/lib/purchasing/po-snapshots";

// Supabase server client type — narrowed for the helper signature so the
// recompute helper can be reused from either action without re-creating it.
type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type ManageLinesResult = { ok: true } | { ok: false; error: string };

type ParsedLineFields = {
  part_id: string;
  quantity: number;
  /**
   * Nullable — Dennis sends a PO "request" before the supplier has quoted, then
   * fills the price from the order confirmation. A blank price is allowed; the
   * DB's GENERATED landed cost is NULL until a price is entered, and receiving
   * is blocked on unpriced lines (see receive.ts).
   */
  unit_price: number | null;
  currency: string;
  fx_rate_to_dkk: number;
  /** 0.10 = 10 %. Snapshotted onto the PO line. */
  transport_pct: number;
  notes: string | null;
};

function parseNumeric(
  raw: string | null,
  field: string,
  opts: { allowZero?: boolean } = {},
): { ok: true; value: number } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: `${field} is required.` };
  const normalized = raw.replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${field} must be a number.` };
  }
  if (opts.allowZero ? n < 0 : n <= 0) {
    return {
      ok: false,
      error: `${field} must be ${opts.allowZero ? "non-negative" : "greater than zero"}.`,
    };
  }
  return { ok: true, value: n };
}

/**
 * Like parseNumeric but a blank value resolves to null instead of an error.
 * Used for the optional unit price on a PO request.
 */
function parseOptionalNumeric(
  raw: string | null,
  field: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (!raw || raw.trim() === "") return { ok: true, value: null };
  const parsed = parseNumeric(raw, field, { allowZero: true });
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

function parseLineFields(
  formData: FormData,
): { ok: true; values: ParsedLineFields } | { ok: false; error: string } {
  const part_id = nullable(formData.get("part_id"));
  if (!part_id) return { ok: false, error: "Pick a part." };

  const qty = parseNumeric(nullable(formData.get("quantity")), "Quantity");
  if (!qty.ok) return { ok: false, error: qty.error };

  const unit = parseOptionalNumeric(
    nullable(formData.get("unit_price")),
    "Unit price",
  );
  if (!unit.ok) return { ok: false, error: unit.error };

  const currency = (nullable(formData.get("currency")) ?? "").toUpperCase();
  if (!currency || currency.length !== 3) {
    return { ok: false, error: "Pick a currency." };
  }

  const fx = parseNumeric(
    nullable(formData.get("fx_rate_to_dkk")),
    "FX rate",
  );
  if (!fx.ok) return { ok: false, error: fx.error };

  // Form sends the transport markup as a percentage (decimal). Default
  // matches the post-refactor schema default of 0.10 (10 %).
  const transportRaw = nullable(formData.get("transport_pct"));
  let transport_pct = 0.10;
  if (transportRaw) {
    const t = parseNumeric(transportRaw, "Transport %", { allowZero: true });
    if (!t.ok) return { ok: false, error: t.error };
    if (t.value > 1) {
      return {
        ok: false,
        error: "Transport % must be a decimal (0.10 = 10 %).",
      };
    }
    transport_pct = t.value;
  }

  return {
    ok: true,
    values: {
      part_id,
      quantity: qty.value,
      unit_price: unit.value,
      currency,
      fx_rate_to_dkk: fx.value,
      transport_pct,
      notes: nullable(formData.get("notes")),
    },
  };
}

async function assertDraft(
  supabase: SupabaseServer,
  poId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select("status")
    .eq("id", poId)
    .maybeSingle();
  if (error || !po) {
    return {
      ok: false,
      error: `Could not load PO: ${error?.message ?? "not found"}`,
    };
  }
  if (po.status !== "draft") {
    return {
      ok: false,
      error: "Lines can only be edited while the PO is in draft.",
    };
  }
  return { ok: true };
}

/**
 * Add a line to a draft PO.
 *
 * `landed_cost_dkk_per_unit` is a `GENERATED ALWAYS AS STORED` column in
 * Postgres — we do NOT write it. The DB computes it from `unit_price *
 * fx_rate_to_dkk * (1 + transport_pct + tariff_pct)` on every insert/update.
 * The UI previews the same arithmetic so the user sees the landed cost as
 * they type. tariff_pct is snapshotted from the selected part's HS code so
 * the cost basis stays frozen even if Dennis later reclassifies the part.
 *
 * Schema has no UNIQUE(po, part) so we defensively check for a duplicate part
 * before inserting — much friendlier than letting a future constraint blow up
 * the round-trip.
 */
export async function addLine(
  poId: string,
  formData: FormData,
): Promise<ManageLinesResult> {
  if (!poId) return { ok: false, error: "Missing PO id." };

  const parsed = parseLineFields(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const supabase = await createClient();
  const guard = await assertDraft(supabase, poId);
  if (!guard.ok) return guard;

  // Defensive duplicate check (no DB UNIQUE constraint as of today).
  const { data: existing, error: existingErr } = await supabase
    .from("purchase_order_lines")
    .select("id")
    .eq("purchase_order_id", poId)
    .eq("part_id", v.part_id)
    .maybeSingle();
  if (existingErr) {
    return {
      ok: false,
      error: `Could not check existing lines: ${existingErr.message}`,
    };
  }
  if (existing) {
    return {
      ok: false,
      error:
        "That part is already on this PO. Edit the existing line instead of adding a second row.",
    };
  }

  const [tariff_pct, anti_dumping_pct] = await Promise.all([
    resolveTariffPctForPart(supabase, v.part_id),
    resolveAntiDumpingPctForPart(supabase, v.part_id),
  ]);

  const { error: insErr } = await supabase
    .from("purchase_order_lines")
    .insert({
      purchase_order_id: poId,
      part_id: v.part_id,
      quantity: v.quantity,
      unit_price: v.unit_price,
      currency: v.currency,
      fx_rate_to_dkk: v.fx_rate_to_dkk,
      transport_pct: v.transport_pct,
      tariff_pct,
      anti_dumping_pct: anti_dumping_pct > 0 ? anti_dumping_pct : null,
      notes: v.notes,
    });
  if (insErr) {
    if (insErr.code === "23505") {
      return {
        ok: false,
        error:
          "That part is already on this PO. Edit the existing line instead.",
      };
    }
    return { ok: false, error: `Could not add line: ${insErr.message}` };
  }

  await recomputePOTotal(supabase, poId);

  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders");
  return { ok: true };
}

/**
 * Update a line on a draft PO. Part swaps are allowed (the row identity is
 * the line id, not the part) but we re-run the duplicate check because the
 * caller might pick a part that's already on a different row.
 */
export async function updateLine(
  lineId: string,
  formData: FormData,
): Promise<ManageLinesResult> {
  if (!lineId) return { ok: false, error: "Missing line id." };

  const parsed = parseLineFields(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const supabase = await createClient();
  const { data: line, error: lookupErr } = await supabase
    .from("purchase_order_lines")
    .select("id, purchase_order_id")
    .eq("id", lineId)
    .maybeSingle();
  if (lookupErr || !line) {
    return {
      ok: false,
      error: `Could not load line: ${lookupErr?.message ?? "not found"}`,
    };
  }

  const guard = await assertDraft(supabase, line.purchase_order_id);
  if (!guard.ok) return guard;

  // Duplicate-part guard (only if the part actually changed).
  const { data: clash, error: clashErr } = await supabase
    .from("purchase_order_lines")
    .select("id")
    .eq("purchase_order_id", line.purchase_order_id)
    .eq("part_id", v.part_id)
    .neq("id", lineId)
    .maybeSingle();
  if (clashErr) {
    return {
      ok: false,
      error: `Could not check existing lines: ${clashErr.message}`,
    };
  }
  if (clash) {
    return {
      ok: false,
      error:
        "Another line on this PO already uses that part. Pick a different part.",
    };
  }

  const [tariff_pct, anti_dumping_pct] = await Promise.all([
    resolveTariffPctForPart(supabase, v.part_id),
    resolveAntiDumpingPctForPart(supabase, v.part_id),
  ]);

  const { error: updErr } = await supabase
    .from("purchase_order_lines")
    .update({
      part_id: v.part_id,
      quantity: v.quantity,
      unit_price: v.unit_price,
      currency: v.currency,
      fx_rate_to_dkk: v.fx_rate_to_dkk,
      transport_pct: v.transport_pct,
      tariff_pct,
      anti_dumping_pct: anti_dumping_pct > 0 ? anti_dumping_pct : null,
      notes: v.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lineId);
  if (updErr) {
    return { ok: false, error: `Could not update line: ${updErr.message}` };
  }

  await recomputePOTotal(supabase, line.purchase_order_id);

  revalidatePath(`/purchase-orders/${line.purchase_order_id}`);
  revalidatePath("/purchase-orders");
  return { ok: true };
}

/**
 * Hard-delete a line on a draft PO. There's no soft-delete column on
 * purchase_order_lines — the audit trail lives in the PO's status history
 * once it's been placed, and draft-only deletions are routine cleanup.
 */
export async function deleteLine(
  lineId: string,
): Promise<ManageLinesResult> {
  if (!lineId) return { ok: false, error: "Missing line id." };

  const supabase = await createClient();
  const { data: line, error: lookupErr } = await supabase
    .from("purchase_order_lines")
    .select("id, purchase_order_id")
    .eq("id", lineId)
    .maybeSingle();
  if (lookupErr || !line) {
    return {
      ok: false,
      error: `Could not load line: ${lookupErr?.message ?? "not found"}`,
    };
  }

  const guard = await assertDraft(supabase, line.purchase_order_id);
  if (!guard.ok) return guard;

  const { error: delErr } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("id", lineId);
  if (delErr) {
    return { ok: false, error: `Could not remove line: ${delErr.message}` };
  }

  await recomputePOTotal(supabase, line.purchase_order_id);

  revalidatePath(`/purchase-orders/${line.purchase_order_id}`);
  revalidatePath("/purchase-orders");
  return { ok: true };
}
