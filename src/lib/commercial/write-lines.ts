/**
 * Reading, validating and WRITING a commercial document's lines — shared by
 * sales orders and offers, whose line tables are column-identical.
 *
 * The document is named by a `CommercialDocSpec` rather than by branching, so
 * the money maths and the parent-total recompute exist once. Each caller keeps
 * its OWN guards (an SO locks its lines past `draft`; an offer locks at `sent`)
 * because those are statements about that document's lifecycle, not about lines.
 *
 * Every writer here recomputes the parent's stored totals before returning —
 * that pairing is the thing that must never be forgotten, so it is not left to
 * the caller.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import type { createClient } from "@/lib/supabase/server";
import {
  computeLineMoney,
  round4,
  sumLineMoney,
  type CommercialLineResult,
  type CommercialLineValues,
} from "./lines";

type Db = Awaited<ReturnType<typeof createClient>>;
type Translator = Awaited<ReturnType<typeof getTranslations>>;

export type { CommercialLineResult };

export type CommercialDocSpec = {
  linesTable: "sales_order_lines" | "offer_lines";
  parentTable: "sales_orders" | "offers";
  /** The FK column on the lines table pointing back at the parent. */
  fk: "sales_order_id" | "offer_id";
};

export const SALES_ORDER_DOC: CommercialDocSpec = {
  linesTable: "sales_order_lines",
  parentTable: "sales_orders",
  fk: "sales_order_id",
};

export const OFFER_DOC: CommercialDocSpec = {
  linesTable: "offer_lines",
  parentTable: "offers",
  fk: "offer_id",
};

/**
 * PostgREST builders are typed per TABLE, so a spec-driven `from()` returns a
 * union whose `.insert()` payloads refuse to unify — `offer_lines.unit_price`
 * is nullable where `sales_order_lines.unit_price` is NOT NULL. Only the
 * `from()` is loosened here; every payload below is built as a typed
 * `CommercialLineValues`-derived object first, so the column names are still
 * checked at their source.
 */
function loose(supabase: Db): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

function parsePositiveNumber(
  raw: string | null,
  field: string,
  t: Translator,
  opts: { allowZero?: boolean } = {},
): { ok: true; value: number } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: t("fieldRequired", { field }) };
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, error: t("fieldMustBeNumber", { field }) };
  }
  if (opts.allowZero ? n < 0 : n <= 0) {
    return {
      ok: false,
      error: opts.allowZero
        ? t("fieldNonNegative", { field })
        : t("fieldPositive", { field }),
    };
  }
  return { ok: true, value: n };
}

/**
 * A line references EXACTLY ONE of part / bike_template; the dialog enforces it
 * client-side and this is the server's own check. VAT code stays optional — the
 * DB allows null and the customer's `default_vat_code` supplies the default.
 */
export function parseLineFields(
  formData: FormData,
  t: Translator,
): { ok: true; values: CommercialLineValues } | { ok: false; error: string } {
  const kindRaw = nullable(formData.get("kind"));
  if (kindRaw !== "part" && kindRaw !== "template") {
    return { ok: false, error: t("lineKindRequired") };
  }
  const kind = kindRaw;

  const part_id = kind === "part" ? nullable(formData.get("part_id")) : null;
  const bike_template_id =
    kind === "template" ? nullable(formData.get("bike_template_id")) : null;
  if (kind === "part" && !part_id) {
    return { ok: false, error: t("linePickPart") };
  }
  if (kind === "template" && !bike_template_id) {
    return { ok: false, error: t("linePickBikeTemplate") };
  }

  const qty = parsePositiveNumber(
    nullable(formData.get("quantity")),
    t("fieldQuantity"),
    t,
  );
  if (!qty.ok) return { ok: false, error: qty.error };

  const price = parsePositiveNumber(
    nullable(formData.get("unit_price")),
    t("fieldUnitPrice"),
    t,
    { allowZero: true },
  );
  if (!price.ok) return { ok: false, error: price.error };

  return {
    ok: true,
    values: {
      kind,
      part_id,
      bike_template_id,
      quantity: qty.value,
      unit_price: price.value,
      vat_code: nullable(formData.get("vat_code")),
      color_id: nullable(formData.get("color_id")),
      description_en: nullable(formData.get("description_en")),
      description_da: nullable(formData.get("description_da")),
    },
  };
}

async function resolveVatRate(
  supabase: Db,
  vatCode: string | null,
): Promise<number> {
  if (!vatCode) return 0;
  const { data } = await supabase
    .from("vat_codes")
    .select("default_rate")
    .eq("code", vatCode)
    .maybeSingle();
  return Number(data?.default_rate ?? 0);
}

/** The parent this line hangs off, or null if the line is gone. Callers need
 *  it to run their own lifecycle guard before writing. */
export async function findLineParentId(
  supabase: Db,
  spec: CommercialDocSpec,
  lineId: string,
): Promise<string | null> {
  const { data } = await loose(supabase)
    .from(spec.linesTable)
    .select(`id, ${spec.fk}`)
    .eq("id", lineId)
    .maybeSingle();
  const parentId = (data as Record<string, unknown> | null)?.[spec.fk];
  return typeof parentId === "string" ? parentId : null;
}

/** Recompute the parent's stored subtotal / VAT / total from its lines. */
async function recomputeDocumentTotals(
  supabase: Db,
  spec: CommercialDocSpec,
  parentId: string,
): Promise<void> {
  const { data } = await loose(supabase)
    .from(spec.linesTable)
    .select("line_subtotal, line_vat_amount, line_total")
    .eq(spec.fk, parentId);

  const totals = sumLineMoney(
    (data ?? []) as {
      line_subtotal: number | null;
      line_vat_amount: number | null;
      line_total: number | null;
    }[],
  );

  await loose(supabase)
    .from(spec.parentTable)
    .update({
      subtotal_amount: totals.subtotal,
      total_vat_amount: totals.vat,
      total_amount: totals.total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parentId);
}

/** The money columns, computed server-side so they never depend on what the
 *  client previewed. */
function moneyColumns(values: CommercialLineValues, vatRate: number) {
  const money = computeLineMoney(values.quantity, values.unit_price, vatRate);
  return {
    line_subtotal: round4(money.subtotal),
    line_vat_amount: round4(money.vat),
    line_total: round4(money.total),
  };
}

function lineColumns(values: CommercialLineValues, vatRate: number) {
  return {
    part_id: values.part_id,
    bike_template_id: values.bike_template_id,
    quantity: values.quantity,
    unit_price: values.unit_price,
    vat_code: values.vat_code,
    vat_rate: vatRate,
    color_id: values.color_id,
    description_en: values.description_en,
    description_da: values.description_da,
    ...moneyColumns(values, vatRate),
  };
}

export async function insertLine(
  supabase: Db,
  spec: CommercialDocSpec,
  parentId: string,
  values: CommercialLineValues,
  t: Translator,
): Promise<CommercialLineResult> {
  const vatRate = await resolveVatRate(supabase, values.vat_code);

  // line_number = max(existing) + 1, so rows render in the order they were
  // added rather than by insertion time.
  const { data: maxRow } = await loose(supabase)
    .from(spec.linesTable)
    .select("line_number")
    .eq(spec.fk, parentId)
    .order("line_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lineNumber = Number((maxRow as { line_number?: number } | null)?.line_number ?? 0) + 1;

  const { error } = await loose(supabase)
    .from(spec.linesTable)
    .insert({
      [spec.fk]: parentId,
      line_number: lineNumber,
      ...lineColumns(values, vatRate),
    });
  if (error) {
    return { ok: false, error: t("lineCouldNotAdd", { detail: error.message }) };
  }

  await recomputeDocumentTotals(supabase, spec, parentId);
  return { ok: true };
}

export async function updateLine(
  supabase: Db,
  spec: CommercialDocSpec,
  lineId: string,
  parentId: string,
  values: CommercialLineValues,
  t: Translator,
): Promise<CommercialLineResult> {
  const vatRate = await resolveVatRate(supabase, values.vat_code);

  const { error } = await loose(supabase)
    .from(spec.linesTable)
    .update(lineColumns(values, vatRate))
    .eq("id", lineId);
  if (error) {
    return {
      ok: false,
      error: t("lineCouldNotUpdate", { detail: error.message }),
    };
  }

  await recomputeDocumentTotals(supabase, spec, parentId);
  return { ok: true };
}

export async function deleteLine(
  supabase: Db,
  spec: CommercialDocSpec,
  lineId: string,
  parentId: string,
  t: Translator,
): Promise<CommercialLineResult> {
  const { error } = await loose(supabase)
    .from(spec.linesTable)
    .delete()
    .eq("id", lineId);
  if (error) {
    return { ok: false, error: t("couldNotDelete", { detail: error.message }) };
  }

  await recomputeDocumentTotals(supabase, spec, parentId);
  return { ok: true };
}
