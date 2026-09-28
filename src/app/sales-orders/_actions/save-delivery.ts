"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability } from "@/lib/auth/read-session";
import { createClient } from "@/lib/supabase/server";

export type SaveDeliveryResult = { ok: true } | { ok: false; error: string };

/**
 * Who receives the order, their phone, and where it goes (migration 107) —
 * known only once the customer has accepted (Dennis, 02:17), and often a
 * department person who is not a contact in the system, so free text.
 * Editable until the order is delivered or cancelled; the delivery note reads
 * it, and Finn calls that number to book the drive.
 */
export async function saveSODelivery(
  soId: string,
  input: { contactName: string; contactPhone: string; address: string },
): Promise<SaveDeliveryResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("so"))) {
    return { ok: false, error: t("deliveryNeedsSo") };
  }
  const supabase = await createClient();
  const { data: so } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", soId)
    .maybeSingle();
  if (!so) return { ok: false, error: t("notFound") };
  if (so.status === "delivered" || so.status === "cancelled") {
    return { ok: false, error: t("deliveryLocked") };
  }
  const clean = (v: string) => v.trim() || null;
  const { error } = await supabase
    .from("sales_orders")
    .update({
      delivery_contact_name: clean(input.contactName),
      delivery_contact_phone: clean(input.contactPhone),
      delivery_address: clean(input.address),
      updated_at: new Date().toISOString(),
    })
    .eq("id", soId);
  if (error) {
    return { ok: false, error: t("couldNotUpdate", { detail: error.message }) };
  }
  revalidatePath(`/sales-orders/${soId}`);
  revalidatePath("/work/deliveries");
  return { ok: true };
}
