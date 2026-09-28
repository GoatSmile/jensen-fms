"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { transitionSO } from "@/app/sales-orders/_actions/transition-so";
import { readHasCapability } from "@/lib/auth/read-session";
import { createServiceClient } from "@/lib/supabase/service";

export type SignDeliveryResult = { ok: true } | { ok: false; error: string };

const BUCKET = "signatures";
const PNG_PREFIX = "data:image/png;base64,";
/** A finger signature is a few tens of kB; anything this big is not one. */
const MAX_BYTES = 1_500_000;

/**
 * The recipient signs on Finn's phone, and that delivers the order
 * (migration 107; Dennis 15 Sep, 02:21–02:24).
 *
 * Order of events, so a failure leaves nothing half-done:
 *  1. The signature image goes to the PRIVATE `signatures` bucket.
 *  2. The order is delivered through `transitionSO` — the one path, which
 *     flips built bikes to *delivered* and takes sold parts off stock. If it
 *     refuses (the order is not ready, say), the image is removed again.
 *  3. Signer, time and image path are recorded on the order.
 *
 * Needs `work`: the floor delivers; the page lives under /work because the
 * Workshop role has no `so`. The service client writes storage, since a
 * private bucket has no public-key policy.
 */
export async function signDelivery(
  soId: string,
  input: { signerName: string; signaturePng: string },
): Promise<SignDeliveryResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("work"))) {
    return { ok: false, error: t("deliveryNeedsWork") };
  }
  const signerName = input.signerName.trim();
  if (!signerName) return { ok: false, error: t("deliverySignerRequired") };
  if (!input.signaturePng.startsWith(PNG_PREFIX)) {
    return { ok: false, error: t("deliverySignatureRequired") };
  }
  const bytes = Buffer.from(input.signaturePng.slice(PNG_PREFIX.length), "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return { ok: false, error: t("deliverySignatureRequired") };
  }

  const supabase = createServiceClient();
  const { data: so } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", soId)
    .maybeSingle();
  if (!so) return { ok: false, error: t("notFound") };
  if (so.status !== "ready") {
    return { ok: false, error: t("deliveryNotReady") };
  }

  const path = `${soId}/${Date.now()}.png`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: false });
  if (upErr) {
    return {
      ok: false,
      error: t("deliverySignatureUploadFailed", { detail: upErr.message }),
    };
  }

  const delivered = await transitionSO(soId, "delivered", null);
  if (!delivered.ok) {
    await supabase.storage.from(BUCKET).remove([path]);
    return delivered;
  }

  await supabase
    .from("sales_orders")
    .update({
      delivery_signed_by: signerName,
      delivery_signed_at: new Date().toISOString(),
      delivery_signature_path: path,
    })
    .eq("id", soId);

  revalidatePath("/work/deliveries");
  revalidatePath(`/work/deliveries/${soId}`);
  revalidatePath(`/sales-orders/${soId}`);
  return { ok: true };
}
