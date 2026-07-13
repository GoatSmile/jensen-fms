"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { importTaxSnapshot } from "@/lib/purchasing/import-tax";
import {
  recomputePOTotal,
  resolveImportTaxInputs,
} from "@/lib/purchasing/po-snapshots";

// Supabase server client type — narrowed for the helper signature so the
// recompute helper can be reused from either action without re-creating it.
type SupabaseServer = Awaited<ReturnType<typeof createClient>>;
type Translator = Awaited<ReturnType<typeof getTranslations>>;

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
  /**
   * The dialog's "Apply import tax" toggle. Checked → snapshot the part's
   * resolved tariff/anti-dumping rates; unchecked → snapshot both as 0.
   * Either way import_tax_basis freezes the reason (import-tax.ts).
   */
  apply_import_tax: boolean;
  notes: string | null;
};

function parseNumeric(
  raw: string | null,
  field: string,
  t: Translator,
  opts: { allowZero?: boolean } = {},
): { ok: true; value: number } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: t("fieldRequired", { field }) };
  const normalized = raw.replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    return { ok: false, error: t("fieldMustBeNumber", { field }) };
  }
  if (opts.allowZero ? n < 0 : n <= 0) {
    return {
      ok: false,
      error: opts.allowZero
        ? t("fieldNonNegative", { field })
        : t("fieldGreaterThanZero", { field }),
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
  t: Translator,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (!raw || raw.trim() === "") return { ok: true, value: null };
  const parsed = parseNumeric(raw, field, t, { allowZero: true });
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

function parseLineFields(
  formData: FormData,
  t: Translator,
): { ok: true; values: ParsedLineFields } | { ok: false; error: string } {
  const part_id = nullable(formData.get("part_id"));
  if (!part_id) return { ok: false, error: t("poPickPart") };

  const qty = parseNumeric(
    nullable(formData.get("quantity")),
    t("fieldQuantity"),
    t,
  );
  if (!qty.ok) return { ok: false, error: qty.error };

  const unit = parseOptionalNumeric(
    nullable(formData.get("unit_price")),
    t("fieldUnitPrice"),
    t,
  );
  if (!unit.ok) return { ok: false, error: unit.error };

  const currency = (nullable(formData.get("currency")) ?? "").toUpperCase();
  if (!currency || currency.length !== 3) {
    return { ok: false, error: t("pickCurrency") };
  }

  const fx = parseNumeric(
    nullable(formData.get("fx_rate_to_dkk")),
    t("fieldFxRate"),
    t,
  );
  if (!fx.ok) return { ok: false, error: fx.error };

  // Form sends the transport markup as a percentage (decimal). Default
  // matches the post-refactor schema default of 0.10 (10 %).
  const transportRaw = nullable(formData.get("transport_pct"));
  let transport_pct = 0.10;
  if (transportRaw) {
    const parsedTransport = parseNumeric(
      transportRaw,
      t("fieldTransportPct"),
      t,
      { allowZero: true },
    );
    if (!parsedTransport.ok) {
      return { ok: false, error: parsedTransport.error };
    }
    if (parsedTransport.value > 1) {
      return {
        ok: false,
        error: t("poTransportDecimal"),
      };
    }
    transport_pct = parsedTransport.value;
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
      apply_import_tax: formData.get("apply_import_tax") === "on",
      notes: nullable(formData.get("notes")),
    },
  };
}

async function assertDraft(
  supabase: SupabaseServer,
  poId: string,
  t: Translator,
): Promise<
  | { ok: true; supplierId: string | null }
  | { ok: false; error: string }
> {
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select("status, supplier_id")
    .eq("id", poId)
    .maybeSingle();
  if (error || !po) {
    return {
      ok: false,
      error: t("poCouldNotLoad", { detail: error?.message ?? t("notFound") }),
    };
  }
  if (po.status !== "draft") {
    return {
      ok: false,
      error: t("poLinesDraftOnly"),
    };
  }
  return { ok: true, supplierId: po.supplier_id ?? null };
}

/**
 * Add a line to a draft PO.
 *
 * `landed_cost_dkk_per_unit` is a `GENERATED ALWAYS AS STORED` column in
 * Postgres — we do NOT write it. The DB computes it from `unit_price *
 * fx_rate_to_dkk * (1 + transport_pct + tariff_pct)` on every insert/update.
 * The UI previews the same arithmetic so the user sees the landed cost as
 * they type. tariff_pct is snapshotted from the selected part's HS code —
 * or as 0 when the "Apply import tax" toggle is off (EU origin, supplier
 * prepaid, …) — with the reason frozen into import_tax_basis, so the cost
 * basis stays frozen even if Dennis later reclassifies the part.
 *
 * Schema has no UNIQUE(po, part) so we defensively check for a duplicate part
 * before inserting — much friendlier than letting a future constraint blow up
 * the round-trip.
 */
export async function addLine(
  poId: string,
  formData: FormData,
): Promise<ManageLinesResult> {
  const t = await getTranslations("errors");
  if (!poId) return { ok: false, error: t("missingPoId") };

  const parsed = parseLineFields(formData, t);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const v = parsed.values;

  const supabase = await createClient();
  const guard = await assertDraft(supabase, poId, t);
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
      error: t("poCouldNotCheckExistingLines", { detail: existingErr.message }),
    };
  }
  if (existing) {
    return {
      ok: false,
      error: t("poPartAlreadyOnAddRow"),
    };
  }

  const inputs = await resolveImportTaxInputs(
    supabase,
    v.part_id,
    guard.supplierId,
  );
  const snap = importTaxSnapshot(inputs, v.apply_import_tax);

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
      tariff_pct: snap.tariff_pct,
      anti_dumping_pct:
        snap.anti_dumping_pct > 0 ? snap.anti_dumping_pct : null,
      import_tax_basis: snap.import_tax_basis,
      notes: v.notes,
    });
  if (insErr) {
    if (insErr.code === "23505") {
      return {
        ok: false,
        error: t("poPartAlreadyOnEdit"),
      };
    }
    return { ok: false, error: t("poCouldNotAddLine", { detail: insErr.message }) };
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
  const t = await getTranslations("errors");
  if (!lineId) return { ok: false, error: t("missingLineId") };

  const parsed = parseLineFields(formData, t);
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
      error: t("poCouldNotLoadLine", {
        detail: lookupErr?.message ?? t("notFound"),
      }),
    };
  }

  const guard = await assertDraft(supabase, line.purchase_order_id, t);
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
      error: t("poCouldNotCheckExistingLines", { detail: clashErr.message }),
    };
  }
  if (clash) {
    return {
      ok: false,
      error: t("poAnotherLineUsesPart"),
    };
  }

  const inputs = await resolveImportTaxInputs(
    supabase,
    v.part_id,
    guard.supplierId,
  );
  const snap = importTaxSnapshot(inputs, v.apply_import_tax);

  const { error: updErr } = await supabase
    .from("purchase_order_lines")
    .update({
      part_id: v.part_id,
      quantity: v.quantity,
      unit_price: v.unit_price,
      currency: v.currency,
      fx_rate_to_dkk: v.fx_rate_to_dkk,
      transport_pct: v.transport_pct,
      tariff_pct: snap.tariff_pct,
      anti_dumping_pct:
        snap.anti_dumping_pct > 0 ? snap.anti_dumping_pct : null,
      import_tax_basis: snap.import_tax_basis,
      notes: v.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lineId);
  if (updErr) {
    return { ok: false, error: t("poCouldNotUpdateLine", { detail: updErr.message }) };
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
  const t = await getTranslations("errors");
  if (!lineId) return { ok: false, error: t("missingLineId") };

  const supabase = await createClient();
  const { data: line, error: lookupErr } = await supabase
    .from("purchase_order_lines")
    .select("id, purchase_order_id")
    .eq("id", lineId)
    .maybeSingle();
  if (lookupErr || !line) {
    return {
      ok: false,
      error: t("poCouldNotLoadLine", {
        detail: lookupErr?.message ?? t("notFound"),
      }),
    };
  }

  const guard = await assertDraft(supabase, line.purchase_order_id, t);
  if (!guard.ok) return guard;

  const { error: delErr } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("id", lineId);
  if (delErr) {
    return { ok: false, error: t("poCouldNotRemoveLine", { detail: delErr.message }) };
  }

  await recomputePOTotal(supabase, line.purchase_order_id);

  revalidatePath(`/purchase-orders/${line.purchase_order_id}`);
  revalidatePath("/purchase-orders");
  return { ok: true };
}
