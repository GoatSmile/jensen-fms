"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  TICKET_PRIORITIES,
  TICKET_SOURCES,
  type TicketPriority,
  type TicketSource,
} from "@/lib/maintenance/ticket-status";

export type SaveTicketResult =
  | { ok: true; ticketId: string }
  | { ok: false; error: string; field?: string };

const VALID_LANGUAGES = new Set(["da", "en"]);

/**
 * Parse + validate the fields shared between create and update. Returns
 * either a clean payload or an error description matching SaveTicketResult.
 */
function parseTicketForm(formData: FormData):
  | {
      ok: true;
      payload: {
        bike_id: string;
        reported_by_contact_id: string | null;
        reported_by_text: string | null;
        source: TicketSource;
        priority: TicketPriority;
        description: string;
        reported_language: string | null;
        notes: string | null;
      };
    }
  | { ok: false; error: string; field?: string } {
  const bike_id = nullable(formData.get("bike_id"));
  const contactId = nullable(formData.get("reported_by_contact_id"));
  const reporterText = nullable(formData.get("reported_by_text"));
  const sourceRaw = nullable(formData.get("source")) ?? "email";
  const priorityRaw = nullable(formData.get("priority")) ?? "3";
  const description = nullable(formData.get("description"));
  const language = nullable(formData.get("reported_language"));
  const notes = nullable(formData.get("notes"));

  if (!bike_id) {
    return { ok: false, error: "Pick a bike for this ticket.", field: "bike_id" };
  }
  if (!description) {
    return {
      ok: false,
      error: "Describe what's wrong — the workshop needs a starting point.",
      field: "description",
    };
  }
  if (!contactId && !reporterText) {
    return {
      ok: false,
      error: "Pick a contact or enter the reporter's name.",
      field: "reported_by_text",
    };
  }

  if (!TICKET_SOURCES.includes(sourceRaw as TicketSource)) {
    return { ok: false, error: "Unknown source.", field: "source" };
  }
  const priorityNum = Number(priorityRaw);
  if (
    !Number.isInteger(priorityNum) ||
    !TICKET_PRIORITIES.includes(priorityNum as TicketPriority)
  ) {
    return {
      ok: false,
      error: "Pick a priority between 1 (urgent) and 5 (minor).",
      field: "priority",
    };
  }
  if (language && !VALID_LANGUAGES.has(language)) {
    return {
      ok: false,
      error: "Language must be da or en.",
      field: "reported_language",
    };
  }

  // If both contact and free-text are present, the contact wins. The text
  // gets nulled out so the source of truth is unambiguous.
  return {
    ok: true,
    payload: {
      bike_id,
      reported_by_contact_id: contactId,
      reported_by_text: contactId ? null : reporterText,
      source: sourceRaw as TicketSource,
      priority: priorityNum as TicketPriority,
      description,
      reported_language: language,
      notes,
    },
  };
}

/**
 * Create a new maintenance ticket. Document number comes from
 * `next_document_number('maintenance_ticket')` → TKT-2026-NNNN.
 */
export async function createTicket(formData: FormData): Promise<SaveTicketResult> {
  const parsed = parseTicketForm(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();

  const { data: ticketNumber, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "maintenance_ticket" },
  );
  if (numErr || typeof ticketNumber !== "string") {
    return {
      ok: false,
      error: `Could not allocate ticket number: ${numErr?.message ?? "unknown error"}`,
    };
  }

  const { data: ticket, error: insErr } = await supabase
    .from("maintenance_tickets")
    .insert({
      ticket_number: ticketNumber,
      bike_id: parsed.payload.bike_id,
      reported_by_contact_id: parsed.payload.reported_by_contact_id,
      reported_by_text: parsed.payload.reported_by_text,
      source: parsed.payload.source,
      priority: parsed.payload.priority,
      description: parsed.payload.description,
      reported_language: parsed.payload.reported_language,
      notes: parsed.payload.notes,
      status: "open",
    })
    .select("id")
    .single();
  if (insErr || !ticket) {
    return {
      ok: false,
      error: `Could not create ticket: ${insErr?.message ?? "unknown error"}`,
    };
  }

  revalidatePath("/maintenance/tickets");
  redirect(`/maintenance/tickets/${ticket.id}`);
}

/**
 * Update an existing ticket. The fields are the same as create; we don't
 * touch ticket_number, status, resolved_at, or timestamps here — status
 * lives in `transitionTicket`.
 */
export async function updateTicket(
  ticketId: string,
  formData: FormData,
): Promise<SaveTicketResult> {
  if (!ticketId) {
    return { ok: false, error: "Missing ticket id." };
  }
  const parsed = parseTicketForm(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from("maintenance_tickets")
    .update({
      bike_id: parsed.payload.bike_id,
      reported_by_contact_id: parsed.payload.reported_by_contact_id,
      reported_by_text: parsed.payload.reported_by_text,
      source: parsed.payload.source,
      priority: parsed.payload.priority,
      description: parsed.payload.description,
      reported_language: parsed.payload.reported_language,
      notes: parsed.payload.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (updErr) {
    return { ok: false, error: `Could not update ticket: ${updErr.message}` };
  }

  revalidatePath("/maintenance/tickets");
  revalidatePath(`/maintenance/tickets/${ticketId}`);
  redirect(`/maintenance/tickets/${ticketId}`);
}
