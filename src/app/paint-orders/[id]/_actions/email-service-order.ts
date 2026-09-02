"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/embed";
import {
  loadCommunicationSettings,
  resolveRecipients,
} from "@/lib/communication/settings";
import { sendAndRecord } from "@/lib/email/outbox";
import { readPersonId } from "@/lib/auth/read-session";
import { COMPANY } from "@/lib/invoicing/company";
import { loadServiceOrderDocument } from "@/lib/services/service-order-document";
import { renderServiceOrderEmailHtml } from "@/lib/services/service-order-email-html";

import { transitionServiceOrderStatus } from "./transition-status";

export type EmailServiceOrderResult =
  | { ok: true; to: string[]; testMode: boolean; markedSent: boolean }
  | { ok: false; error: string };

/**
 * Email the supplier-facing order document (same loadServiceOrderDocument
 * payload as the print page) to the supplier's on-file addresses, in the
 * supplier's document language. Recipients resolve through the communication
 * settings: while outbound test mode is on, the mail reroutes to the test
 * inboxes with a banner naming the intended recipients, and the stamp records
 * "test:" so it can't read as a real send.
 *
 * EMAILING IS THE SEND. A `planned` order is moved to `sent` FIRST — that runs
 * the send gate (lines present, every line priceable) and freezes the prices —
 * and only then is the document rendered, so mail, paper and ledger carry the
 * same numbers. Every deterministic failure (no sender, no recipient) is
 * checked before that state change; only a provider/network failure can leave
 * an order `sent` with no email stamp, and the error says so — the header
 * shows no "Emailed" line, and Email can simply be used again.
 *
 * Order and line notes never leave the building: the optional message is the
 * only free text the supplier sees (po-document doctrine).
 */
export async function emailServiceOrderToSupplier(
  serviceOrderId: string,
  message: string | null,
): Promise<EmailServiceOrderResult> {
  const t = await getTranslations("errors");
  if (!serviceOrderId) return { ok: false, error: t("missingOrderId") };

  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("service_orders")
    .select(
      "id, status, supplier:suppliers!supplier_id(name, email_primary, email_secondary)",
    )
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (orderErr || !order) {
    return {
      ok: false,
      error: t("paintCouldNotLoadOrder", {
        detail: orderErr?.message ?? t("notFound"),
      }),
    };
  }
  if (order.status === "cancelled" || order.status === "received_back") {
    return {
      ok: false,
      error: t("paintCannotEmailStatus", { status: order.status }),
    };
  }
  const supplier = one(order.supplier);

  // Deterministic failures first — nothing below changes state until these pass.
  const settings = await loadCommunicationSettings(supabase);
  if (!settings.fromEmail) {
    return { ok: false, error: t("paintNoFromAddress") };
  }
  const realRecipients = [
    supplier?.email_primary,
    supplier?.email_secondary,
  ].filter((e): e is string => Boolean(e));
  const resolved = resolveRecipients(settings, realRecipients);
  if (!resolved.ok) {
    return {
      ok: false,
      error:
        realRecipients.length === 0 && !settings.testMode
          ? t("paintSupplierNoEmail", {
              name: supplier?.name ?? t("theSupplier"),
            })
          : resolved.error,
    };
  }

  // The send itself: gate + price freeze, via the one transition everyone uses.
  let markedSent = false;
  if (order.status === "planned") {
    const moved = await transitionServiceOrderStatus(
      serviceOrderId,
      "sent",
      null,
    );
    if (!moved.ok) return moved;
    markedSent = true;
  }

  const doc = await loadServiceOrderDocument(supabase, serviceOrderId);
  if (!doc) return { ok: false, error: t("notFound") };
  if (doc.lines.length === 0) {
    return { ok: false, error: t("paintAddItemBeforeEmailing") };
  }

  const trimmedMessage = message?.trim() || null;
  const subject = `${resolved.testMode ? "[TEST] " : ""}${doc.title} ${doc.orderNumber} — ${COMPANY.name}`;
  const html = renderServiceOrderEmailHtml(doc, {
    companyName: COMPANY.name,
    contactEmail: settings.replyToEmail,
    message: trimmedMessage,
    testMode: resolved.testMode,
    intended: resolved.intended,
  });

  const sent = await sendAndRecord(supabase, {
    target: { kind: "service_order", serviceOrderId },
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
    revalidatePath(`/paint-orders/${serviceOrderId}`);
    return {
      ok: false,
      error: markedSent
        ? t("paintMarkedSentEmailFailed", { detail: sent.error })
        : sent.error,
    };
  }

  // Last-send-wins stamp; "test:" prefix keeps rerouted sends honest.
  const nowIso = new Date().toISOString();
  const { error: stampErr } = await supabase
    .from("service_orders")
    .update({
      emailed_at: nowIso,
      emailed_to: `${resolved.testMode ? "test:" : ""}${resolved.to.join(", ")}`,
      updated_at: nowIso,
    })
    .eq("id", serviceOrderId);
  if (stampErr) {
    // The mail IS out — surface the stamp failure rather than pretending
    // nothing was sent.
    revalidatePath(`/paint-orders/${serviceOrderId}`);
    return {
      ok: false,
      error: t("paintEmailSentStampFailed", { detail: stampErr.message }),
    };
  }

  revalidatePath(`/paint-orders/${serviceOrderId}`);
  revalidatePath("/paint-orders");
  return { ok: true, to: resolved.to, testMode: resolved.testMode, markedSent };
}
