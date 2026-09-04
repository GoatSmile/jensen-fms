"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  canReopenForRevision,
  defaultExpiryDate,
  validNextStatuses,
  type OfferStatus,
} from "@/lib/offers/status";

export type TransitionOfferResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Freeze an offer as SENT.
 *
 * Exported because there are two ways an offer reaches the customer and both
 * must freeze identically: emailing it from the app (which calls this before
 * rendering, so mail, paper and ledger carry the same numbers — the paint-order
 * doctrine), and printing it to hand over, which marks it sent by hand.
 *
 * Stamps `issued_date` now and fills `expiry_date` if nobody chose one. On a
 * re-send after a revision both restamp: the clock runs from the document the
 * customer is actually holding.
 */
export async function markOfferSent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  offerId: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): Promise<TransitionOfferResult> {
  const { data: offer } = await supabase
    .from("offers")
    .select("id, status, expiry_date")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return { ok: false, error: t("offerNotFound") };
  if (offer.status !== "draft") {
    return { ok: false, error: t("offerAlreadySent", { status: offer.status }) };
  }

  // An offer with no lines is a blank page with a number on it.
  const { count } = await supabase
    .from("offer_lines")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", offerId);
  if ((count ?? 0) === 0) {
    return { ok: false, error: t("offerNeedsLine") };
  }

  const issued = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("offers")
    .update({
      status: "sent",
      issued_date: issued,
      expiry_date: offer.expiry_date ?? defaultExpiryDate(issued),
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);
  if (error) {
    return { ok: false, error: t("offerCouldNotUpdate", { detail: error.message }) };
  }
  return { ok: true };
}

/** The button on the offer page, for the printed-and-handed-over path. */
export async function sendOffer(offerId: string): Promise<TransitionOfferResult> {
  const t = await getTranslations("errors");
  if (!offerId) return { ok: false, error: t("missingOfferId") };

  const supabase = await createClient();
  const result = await markOfferSent(supabase, offerId, t);
  if (!result.ok) return result;

  revalidatePath(`/offers/${offerId}`);
  revalidatePath("/offers");
  return { ok: true };
}

/** Customer said yes, or said no. Both are facts about the customer, and both
 *  are reversible — people change their minds. */
export async function transitionOffer(
  offerId: string,
  to: OfferStatus,
): Promise<TransitionOfferResult> {
  const t = await getTranslations("errors");
  if (!offerId) return { ok: false, error: t("missingOfferId") };

  const supabase = await createClient();
  const { data: offer } = await supabase
    .from("offers")
    .select("id, status")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return { ok: false, error: t("offerNotFound") };

  const from = offer.status as OfferStatus;
  if (to === "sent") return sendOffer(offerId);
  if (!validNextStatuses(from).includes(to)) {
    return { ok: false, error: t("offerBadTransition", { from, to }) };
  }

  const { error } = await supabase
    .from("offers")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", offerId);
  if (error) {
    return { ok: false, error: t("offerCouldNotUpdate", { detail: error.message }) };
  }

  revalidatePath(`/offers/${offerId}`);
  revalidatePath("/offers");
  return { ok: true };
}

/**
 * The counteroffer path: back to draft, one revision higher.
 *
 * The offer NUMBER never changes — Dennis and the customer go on talking about
 * "tilbud 0001" — but the document says which revision it is, so the two are
 * distinguishable. What the customer was previously sent is not lost by this:
 * the exact body of every send is kept in `outbound_messages`.
 */
export async function reopenOfferForRevision(
  offerId: string,
): Promise<TransitionOfferResult> {
  const t = await getTranslations("errors");
  if (!offerId) return { ok: false, error: t("missingOfferId") };

  const supabase = await createClient();
  const { data: offer } = await supabase
    .from("offers")
    .select("id, status, revision")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return { ok: false, error: t("offerNotFound") };

  if (!canReopenForRevision(offer.status as OfferStatus)) {
    return { ok: false, error: t("offerCannotReopen", { status: offer.status }) };
  }

  const { error } = await supabase
    .from("offers")
    .update({
      status: "draft",
      revision: Number(offer.revision ?? 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);
  if (error) {
    return { ok: false, error: t("offerCouldNotUpdate", { detail: error.message }) };
  }

  revalidatePath(`/offers/${offerId}`);
  revalidatePath("/offers");
  return { ok: true };
}
