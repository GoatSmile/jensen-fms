"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

export type SetDefaultSupplierResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Set (or clear) a service type's default supplier — the operational config
 * that replaced the DEFAULT_PAINTER_NAME constant (migration 67). New-order
 * forms pre-select it and the template cost estimate prices against it.
 */
export async function setServiceTypeDefaultSupplier(
  serviceTypeId: string,
  supplierId: string | null,
): Promise<SetDefaultSupplierResult> {
  const t = await getTranslations("errors");
  if (!serviceTypeId) return { ok: false, error: t("missingId") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_types")
    .update({ default_supplier_id: supplierId || null })
    .eq("id", serviceTypeId);
  if (error) {
    return {
      ok: false,
      error: t("couldNotSave", { detail: error.message }),
    };
  }
  revalidatePath("/admin/services");
  return { ok: true };
}
