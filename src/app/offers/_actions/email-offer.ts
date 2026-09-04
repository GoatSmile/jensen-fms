"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  loadCommunicationSettings,
  resolveRecipients,
} from "@/lib/communication/settings";
import { sendAndRecord } from "@/lib/email/outbox";
import { readPersonId } from "@/lib/auth/read-session";
import { COMPANY } from "@/lib/invoicing/company";
import { loadOfferDocument } from "@/lib/offers/offer-document";
import { renderOfferEmailHtml } from "@/lib/offers/offer-email-html";

import { markOfferSent } from "./transition-offer";

export type EmailOfferResult =
  | { ok: true; to: string[]; testMode: boolean; markedSent: boolean }
  | { ok: false; error: string };

/**
 * Email the offer to the customer, in the OFFER's language.
 *
 * EMAILING IS THE SEND — the paint-order doctrine. A draft is moved to `sent`
 * FIRST, which runs the gate (at least one line) and stamps the issue and
 * expiry dates, and only then is the document rendered. So the mail, the
 * printed page and the ledger all carry the same numbers and the same
 * validity date.
 *
 * Every deterministic failure (no sender, no recipient) is checked BEFORE that
 * state change. Only a provider or network failure can leave an offer `sent`
 * with no email out, and the error says exactly that — Email can be used again.
 *
 * `offers.notes` never travels: order notes are internal, and the dialog's
 * message is the only free text the customer sees.
 */
export async function emailOfferToCustomer(
  offerId: string,
  message: string | null,
): Promise<EmailOfferResult> {
  const t = await getTranslations("errors");
  if (!offerId) return { ok: false, error: t("missingOfferId") };

  const supabase = await createClient();

  const { data: offer, error: offerErr } = await supabase
    .from("offers")
    .select(
      `id, status,
       organization:organizations!organization_id(legal_name, display_name_en, display_name_da, email),
       contact:contacts!contact_id(email)`,
    )
    .eq("id", offerId)
    .maybeSingle();
  if (offerErr || !offer) {
    return {
      ok: false,
      error: t("offerCouldNotLoad", {
        detail: offerErr?.message ?? t("notFound"),
      }),
    };
  }
  if (offer.status === "converted") {
    return {
      ok: false,
      error: t("offerCannotEmailStatus", { status: offer.status }),
    };
  }

  // Deterministic failures first — nothing below changes state until these pass.
  const settings = await loadCommunicationSettings(supabase);
  if (!settings.fromEmail) return { ok: false, error: t("offerNoFromAddress") };

  // The named contact wins; the organization's own address is the fallback.
  const realRecipients = [
    offer.contact?.email,
    offer.organization?.email,
  ].filter((e): e is string => Boolean(e));
  const resolved = resolveRecipients(settings, realRecipients);
  if (!resolved.ok) {
    const customerName =
      offer.organization?.display_name_da ??
      offer.organization?.display_name_en ??
      offer.organization?.legal_name ??
      t("theCustomer");
    return {
      ok: false,
      error:
        realRecipients.length === 0 && !settings.testMode
          ? t("offerCustomerNoEmail", { name: customerName })
          : resolved.error,
    };
  }

  // The send itself: gate + date stamps, via the one transition everyone uses.
  let markedSent = false;
  if (offer.status === "draft") {
    const moved = await markOfferSent(supabase, offerId, t);
    if (!moved.ok) return moved;
    markedSent = true;
  }

  const doc = await loadOfferDocument(supabase, offerId);
  if (!doc) return { ok: false, error: t("notFound") };

  const trimmedMessage = message?.trim() || null;
  const subject = `${resolved.testMode ? "[TEST] " : ""}${doc.labels.title} ${doc.offerNumber}${
    doc.revision > 1 ? ` · ${doc.labels.revision} ${doc.revision}` : ""
  } — ${COMPANY.name}`;
  const html = renderOfferEmailHtml(doc, {
    companyName: COMPANY.name,
    contactEmail: settings.replyToEmail,
    message: trimmedMessage,
    testMode: resolved.testMode,
    intended: resolved.intended,
  });

  const sent = await sendAndRecord(supabase, {
    target: { kind: "offer", offerId },
    from: settings.fromEmail,
    to: resolved.to,
    intended: resolved.intended,
    replyTo: settings.replyToEmail,
    subject,
    html,
    testMode: resolved.testMode,
    actorPersonId: await readPersonId(),
  });
  if (!sent.ok) {
    // The status may already have moved; the page must show that.
    revalidatePath(`/offers/${offerId}`);
    return {
      ok: false,
      error: markedSent
        ? t("offerMarkedSentEmailFailed", { detail: sent.error })
        : sent.error,
    };
  }

  revalidatePath(`/offers/${offerId}`);
  revalidatePath("/offers");
  return { ok: true, to: resolved.to, testMode: resolved.testMode, markedSent };
}
