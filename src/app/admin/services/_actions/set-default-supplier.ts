"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

export type SetDefaultSupplierResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Point a service type's default supplier at one that HAS a current price list.
 *
 * This is the operational config that replaced the DEFAULT_PAINTER_NAME constant
 * (migration 67): new-order forms pre-select it and the template cost estimate
 * prices against it.
 *
 * **Why it validates instead of just writing.** The previous UI was a free
 * dropdown of every active supplier, and picking one with no price list put the
 * system in a state where nothing said so: `/admin/services` showed the chosen
 * name, the template estimate quietly priced off whichever list did exist, and
 * a new paint order pre-selected a supplier whose lines could never be priced —
 * so it could never be sent. Reached in prod on 2026-07-29 by doing nothing more
 * unusual than trying the dropdown.
 *
 * The UI now offers "Make default" only on a price-list panel that has a current
 * revision, so the bad choice is unreachable by clicking. This check is the
 * belt-and-braces half: a stale form post or a hand-rolled call gets a real
 * error rather than writing the state back.
 */
export async function setServiceTypeDefaultSupplier(
  serviceTypeId: string,
  supplierId: string | null,
): Promise<SetDefaultSupplierResult> {
  const t = await getTranslations("errors");
  if (!serviceTypeId) return { ok: false, error: t("missingId") };

  const supabase = await createClient();

  // Clearing is always allowed: "no default" is an honest state, and the
  // estimate now says so rather than substituting a supplier.
  if (supplierId) {
    const { data: current, error: listError } = await supabase
      .from("service_price_lists")
      .select("id")
      .eq("service_type_id", serviceTypeId)
      .eq("supplier_id", supplierId)
      .eq("is_current", true)
      .maybeSingle();
    if (listError) {
      return {
        ok: false,
        error: t("couldNotSave", { detail: listError.message }),
      };
    }
    if (!current) {
      return { ok: false, error: t("serviceDefaultNeedsPriceList") };
    }
  }

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
  // The template cost-to-produce box prices against this.
  revalidatePath("/bike-templates");
  revalidatePath("/bike-templates/[id]", "page");
  revalidatePath("/paint-orders/new");
  return { ok: true };
}
