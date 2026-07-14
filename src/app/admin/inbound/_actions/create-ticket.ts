"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import { parseExtraction, type InboundUrgency } from "@/lib/inbound/extraction";

export type CreateTicketResult =
  | { ok: true; ticketId: string; ticketNumber: string }
  | { ok: false; error: string };

/** Urgency → ticket priority (1 urgent … 5 minor). Conservative: an
 * unverified transcript never screams "urgent" — a reviewer can bump it. */
const PRIORITY_BY_URGENCY: Record<InboundUrgency, number> = {
  high: 2,
  normal: 3,
  low: 4,
};

/** reported_language is a short code column; keep it to da/en or null. */
function normalizeLanguage(lang: string | null): string | null {
  const l = lang?.toLowerCase() ?? "";
  if (l.startsWith("da")) return "da";
  if (l.startsWith("en")) return "en";
  return null;
}

/**
 * Shadow-mode ticketing (Slice E): a reviewer turns a matched inbound message
 * into a draft maintenance ticket. Human-in-the-loop by construction — the
 * pipeline never auto-creates in v1 (that's the F + shadow-off go-live). The
 * exactly-one matched bike/contact are attached; ambiguous ones are left for
 * the tech to resolve on the ticket. Provenance lives on
 * inbound_messages.ticket_id (drives the "from phone — review" banner).
 */
export async function createTicketFromInbound(
  messageId: string,
): Promise<CreateTicketResult> {
  const t = await getTranslations("errors");
  const supabase = createServiceClient();

  const { data: msg, error: loadErr } = await supabase
    .from("inbound_messages")
    .select(
      "id, from_identity, body_text, extraction, ticket_id, matched_bike_id, matched_contact_id",
    )
    .eq("id", messageId)
    .maybeSingle();
  if (loadErr) {
    return { ok: false, error: t("couldNotSave", { detail: loadErr.message }) };
  }
  if (!msg) return { ok: false, error: t("missingId") };
  if (msg.ticket_id) {
    return { ok: false, error: t("inboundTicketExists") };
  }

  const extraction = parseExtraction(msg.extraction);
  // Description is NOT NULL — problem, else the transcript, else a placeholder.
  const description =
    extraction.problem ?? msg.body_text ?? t("inboundNoDetails");
  const priority = extraction.urgency
    ? PRIORITY_BY_URGENCY[extraction.urgency]
    : 3;

  // If the matched bike is in a build phase, don't attach it — build defects
  // belong on the build workbench (the app's ticket-bike rule). A phone repair
  // request is about a delivered bike; guard the rare mismatch.
  let bikeId = msg.matched_bike_id;
  if (bikeId) {
    const { data: bike } = await supabase
      .from("bikes")
      .select("status")
      .eq("id", bikeId)
      .maybeSingle();
    if (bike && (bike.status === "planning" || bike.status === "building")) {
      bikeId = null;
    }
  }

  const { data: ticketNumber, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "maintenance_ticket" },
  );
  if (numErr || typeof ticketNumber !== "string") {
    return {
      ok: false,
      error: t("ticketCouldNotAllocateNumber", {
        detail: numErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { data: ticket, error: insErr } = await supabase
    .from("maintenance_tickets")
    .insert({
      ticket_number: ticketNumber,
      source: "phone",
      status: "open",
      description,
      priority,
      bike_id: bikeId,
      reported_by_contact_id: msg.matched_contact_id,
      reported_by_text: extraction.callerName,
      reported_by_phone: msg.from_identity ?? extraction.callbackNumber,
      reported_language: normalizeLanguage(extraction.language),
    })
    .select("id")
    .single();
  if (insErr || !ticket) {
    return {
      ok: false,
      error: t("ticketCouldNotCreate", {
        detail: insErr?.message ?? t("unknownError"),
      }),
    };
  }

  const { error: linkErr } = await supabase
    .from("inbound_messages")
    .update({ ticket_id: ticket.id, status: "actioned" })
    .eq("id", messageId);
  if (linkErr) {
    // Ticket exists but the back-link failed — surface it; the reviewer can
    // see the ticket and we avoid a silent orphan. Not auto-rolled-back
    // because the ticket itself is valid and useful.
    return {
      ok: false,
      error: t("inboundTicketLinkFailed", {
        number: ticketNumber,
        detail: linkErr.message,
      }),
    };
  }

  revalidatePath(`/admin/inbound/${messageId}`);
  revalidatePath("/admin/inbound");
  return { ok: true, ticketId: ticket.id, ticketNumber };
}
