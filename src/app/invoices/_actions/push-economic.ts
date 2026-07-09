"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { pushInvoiceToEconomic } from "@/lib/economic/push-invoice";

export async function pushInvoiceToEconomicAction(
  invoiceId: string,
): Promise<{ ok: true; voucherId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const result = await pushInvoiceToEconomic(supabase, invoiceId);
  if (result.ok) {
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
  }
  return result;
}
