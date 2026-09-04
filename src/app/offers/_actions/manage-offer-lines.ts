"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import type { CommercialLineResult } from "@/lib/commercial/lines";
import {
  OFFER_DOC,
  deleteLine,
  findLineParentId,
  insertLine,
  parseLineFields,
  updateLine,
} from "@/lib/commercial/write-lines";
import { isOfferEditable, type OfferStatus } from "@/lib/offers/status";

/**
 * Offer lines. Shape, validation, money and the parent-total recompute are the
 * shared commercial-lines machine; what is true of an OFFER only is the lock:
 * lines freeze the moment it is sent, and reopen only via a revision.
 */

export type OfferLineResult = CommercialLineResult;

type Translator = Awaited<ReturnType<typeof getTranslations>>;

async function assertDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  offerId: string,
  t: Translator,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: offer } = await supabase
    .from("offers")
    .select("status")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return { ok: false, error: t("offerNotFound") };
  if (!isOfferEditable(offer.status as OfferStatus)) {
    return { ok: false, error: t("offerLinesLocked", { status: offer.status }) };
  }
  return { ok: true };
}

export async function addOfferLine(
  offerId: string,
  formData: FormData,
): Promise<OfferLineResult> {
  const t = await getTranslations("errors");
  if (!offerId) return { ok: false, error: t("missingOfferId") };

  const parsed = parseLineFields(formData, t);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const guard = await assertDraft(supabase, offerId, t);
  if (!guard.ok) return guard;

  const result = await insertLine(
    supabase,
    OFFER_DOC,
    offerId,
    parsed.values,
    t,
  );
  if (!result.ok) return result;

  revalidatePath(`/offers/${offerId}`);
  return { ok: true };
}

export async function updateOfferLine(
  lineId: string,
  formData: FormData,
): Promise<OfferLineResult> {
  const t = await getTranslations("errors");
  if (!lineId) return { ok: false, error: t("missingLineId") };

  const parsed = parseLineFields(formData, t);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const offerId = await findLineParentId(supabase, OFFER_DOC, lineId);
  if (!offerId) return { ok: false, error: t("lineNotFound") };

  const guard = await assertDraft(supabase, offerId, t);
  if (!guard.ok) return guard;

  const result = await updateLine(
    supabase,
    OFFER_DOC,
    lineId,
    offerId,
    parsed.values,
    t,
  );
  if (!result.ok) return result;

  revalidatePath(`/offers/${offerId}`);
  return { ok: true };
}

export async function deleteOfferLine(
  lineId: string,
): Promise<OfferLineResult> {
  const t = await getTranslations("errors");
  if (!lineId) return { ok: false, error: t("missingLineId") };

  const supabase = await createClient();
  const offerId = await findLineParentId(supabase, OFFER_DOC, lineId);
  if (!offerId) return { ok: false, error: t("lineNotFound") };

  const guard = await assertDraft(supabase, offerId, t);
  if (!guard.ok) return guard;

  const result = await deleteLine(supabase, OFFER_DOC, lineId, offerId, t);
  if (!result.ok) return result;

  revalidatePath(`/offers/${offerId}`);
  return { ok: true };
}
