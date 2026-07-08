"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  loadCommunicationSettings,
  resolveRecipients,
} from "@/lib/communication/settings";
import { sendViaResend } from "@/lib/email/send";
import { COMPANY } from "@/lib/invoicing/company";
import { loadPODocument } from "@/lib/purchasing/po-document";
import { renderPOEmailHtml } from "@/lib/purchasing/po-email-html";

export type EmailPOResult =
  | { ok: true; to: string[]; testMode: boolean }
  | { ok: false; error: string };

/**
 * Email the supplier-facing PO document (same loadPODocument payload as the
 * print page) to the supplier's on-file addresses. Recipients resolve
 * through the communication settings: while outbound test mode is on, the
 * mail reroutes to the test inboxes with a banner naming the intended
 * recipients, and the stamp records "test:" so it can't read as a real
 * send. The optional message is the ONLY free text that reaches the
 * supplier — PO/line notes stay internal by design (po-document.ts).
 */
export async function emailPOToSupplier(
  poId: string,
  message: string | null,
): Promise<EmailPOResult> {
  if (!poId) return { ok: false, error: "Missing PO id." };

  const supabase = await createClient();
  const doc = await loadPODocument(supabase, poId);
  if (!doc) return { ok: false, error: "PO not found." };
  if (doc.status === "cancelled") {
    return { ok: false, error: "Cancelled POs can't be emailed." };
  }
  if (doc.lines.length === 0) {
    return { ok: false, error: "Add at least one line before emailing." };
  }

  const settings = await loadCommunicationSettings(supabase);
  if (!settings.fromEmail) {
    return {
      ok: false,
      error:
        "No from-address configured — set one under Admin → Settings → Communication.",
    };
  }

  const realRecipients = [
    doc.supplier?.emailPrimary,
    doc.supplier?.emailSecondary,
  ].filter((e): e is string => Boolean(e));
  const resolved = resolveRecipients(settings, realRecipients);
  if (!resolved.ok) {
    return {
      ok: false,
      error:
        realRecipients.length === 0 && !settings.testMode
          ? `${doc.supplier?.name ?? "The supplier"} has no email on file — add one on the supplier page.`
          : resolved.error,
    };
  }

  const trimmedMessage = message?.trim() || null;
  const subject = `${resolved.testMode ? "[TEST] " : ""}Purchase order ${doc.poNumber} — ${COMPANY.name}`;
  const html = renderPOEmailHtml(doc, {
    companyName: COMPANY.name,
    contactEmail: settings.replyToEmail,
    message: trimmedMessage,
    testMode: resolved.testMode,
    intended: resolved.intended,
  });

  const sent = await sendViaResend({
    from: settings.fromEmail,
    to: resolved.to,
    replyTo: settings.replyToEmail,
    subject,
    html,
  });
  if (!sent.ok) return sent;

  // Last-send-wins stamp; "test:" prefix keeps rerouted sends honest.
  const { error: stampErr } = await supabase
    .from("purchase_orders")
    .update({
      emailed_at: new Date().toISOString(),
      emailed_to: `${resolved.testMode ? "test:" : ""}${resolved.to.join(", ")}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", poId);
  if (stampErr) {
    // The mail IS out — surface the stamp failure rather than pretending
    // nothing was sent.
    return {
      ok: false,
      error: `Email sent, but recording it failed: ${stampErr.message}`,
    };
  }

  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders");
  return { ok: true, to: resolved.to, testMode: resolved.testMode };
}
