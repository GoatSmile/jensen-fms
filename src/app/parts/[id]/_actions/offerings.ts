"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type OfferingResult =
  | { ok: true; offeringId: string }
  | { ok: false; error: string; field?: string };

export type OfferingActionResult =
  | { ok: true }
  | { ok: false; error: string };

type ParsedOffering = {
  supplier_sku: string | null;
  default_purchase_price: number | null;
  default_purchase_currency: string | null;
  minimum_order_quantity: number | null;
  lead_time_days: number | null;
  is_preferred: boolean;
  notes: string | null;
};

function parseFields(
  formData: FormData,
): ParsedOffering | { errorKey: string; field?: string } {
  const priceRaw = nullable(formData.get("default_purchase_price"));
  let default_purchase_price: number | null = null;
  if (priceRaw !== null) {
    const n = Number(priceRaw);
    if (!Number.isFinite(n) || n < 0) {
      return {
        errorKey: "partPurchasePriceNonNegative",
        field: "default_purchase_price",
      };
    }
    default_purchase_price = n;
  }

  const moqRaw = nullable(formData.get("minimum_order_quantity"));
  let minimum_order_quantity: number | null = null;
  if (moqRaw !== null) {
    const n = Number(moqRaw);
    if (!Number.isFinite(n) || n < 0) {
      return {
        errorKey: "partMoqNonNegative",
        field: "minimum_order_quantity",
      };
    }
    minimum_order_quantity = n;
  }

  const leadRaw = nullable(formData.get("lead_time_days"));
  let lead_time_days: number | null = null;
  if (leadRaw !== null) {
    const n = Number(leadRaw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return {
        errorKey: "partLeadTimeWholeDays",
        field: "lead_time_days",
      };
    }
    lead_time_days = n;
  }

  const currency = nullable(formData.get("default_purchase_currency"));
  return {
    supplier_sku: nullable(formData.get("supplier_sku")),
    default_purchase_price,
    default_purchase_currency: currency ? currency.toUpperCase() : null,
    minimum_order_quantity,
    lead_time_days,
    is_preferred: formData.get("is_preferred") === "on",
    notes: nullable(formData.get("notes")),
  };
}

/**
 * Demote every other offering on this part. Used after an insert/update where
 * `is_preferred=true`. Single-preferred-per-part is enforced here, not by the
 * schema.
 */
async function demoteOthers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partId: string,
  keepId: string,
) {
  return supabase
    .from("part_supplier_offerings")
    .update({ is_preferred: false })
    .eq("part_id", partId)
    .eq("is_preferred", true)
    .neq("id", keepId);
}

export async function createOffering(
  partId: string,
  supplierId: string,
  formData: FormData,
): Promise<OfferingResult> {
  const t = await getTranslations("errors");
  if (!partId) return { ok: false, error: t("missingPartId") };
  if (!supplierId)
    return { ok: false, error: t("pickSupplier"), field: "supplier_id" };

  const parsed = parseFields(formData);
  if ("errorKey" in parsed)
    return { ok: false, error: t(parsed.errorKey), field: parsed.field };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("part_supplier_offerings")
    .insert({
      part_id: partId,
      supplier_id: supplierId,
      ...parsed,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        ok: false,
        error: t("partSupplierAlreadyHasOffering"),
        field: "supplier_id",
      };
    }
    return {
      ok: false,
      error: t("partCouldNotSaveOffering", {
        detail: error?.message ?? t("unknownError"),
      }),
    };
  }

  if (parsed.is_preferred) {
    const { error: demErr } = await demoteOthers(supabase, partId, data.id);
    if (demErr)
      return {
        ok: false,
        error: t("partCouldNotDemoteOthers", { detail: demErr.message }),
      };
  }

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
  return { ok: true, offeringId: data.id };
}

export async function updateOffering(
  partId: string,
  offeringId: string,
  formData: FormData,
): Promise<OfferingResult> {
  const t = await getTranslations("errors");
  if (!partId || !offeringId)
    return { ok: false, error: t("partMissingPartOrOffering") };

  const parsed = parseFields(formData);
  if ("errorKey" in parsed)
    return { ok: false, error: t(parsed.errorKey), field: parsed.field };

  const supabase = await createClient();
  const { error } = await supabase
    .from("part_supplier_offerings")
    .update({
      ...parsed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offeringId);

  if (error) return { ok: false, error: t("couldNotSave", { detail: error.message }) };

  if (parsed.is_preferred) {
    const { error: demErr } = await demoteOthers(supabase, partId, offeringId);
    if (demErr)
      return {
        ok: false,
        error: t("partCouldNotDemoteOthers", { detail: demErr.message }),
      };
  }

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
  return { ok: true, offeringId };
}

export async function setPreferredOffering(
  partId: string,
  offeringId: string,
): Promise<OfferingActionResult> {
  const t = await getTranslations("errors");
  if (!partId || !offeringId)
    return { ok: false, error: t("partMissingPartOrOffering") };

  const supabase = await createClient();
  const { error: promoteErr } = await supabase
    .from("part_supplier_offerings")
    .update({ is_preferred: true, updated_at: new Date().toISOString() })
    .eq("id", offeringId);
  if (promoteErr)
    return {
      ok: false,
      error: t("partCouldNotPromote", { detail: promoteErr.message }),
    };

  const { error: demErr } = await demoteOthers(supabase, partId, offeringId);
  if (demErr)
    return {
      ok: false,
      error: t("partCouldNotDemoteOthers", { detail: demErr.message }),
    };

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
  return { ok: true };
}

export async function deleteOffering(
  partId: string,
  offeringId: string,
): Promise<OfferingActionResult> {
  const t = await getTranslations("errors");
  if (!partId || !offeringId)
    return { ok: false, error: t("partMissingPartOrOffering") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("part_supplier_offerings")
    .delete()
    .eq("id", offeringId);
  if (error)
    return { ok: false, error: t("partCouldNotRemove", { detail: error.message }) };

  revalidatePath("/parts");
  revalidatePath(`/parts/${partId}`);
  return { ok: true };
}
