"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { nullableString as nullable } from "@/lib/forms";
import { ticketCreatedEmail } from "@/lib/people/email-content";
import { notifyEvent } from "@/lib/people/notify";
import { appOrigin } from "@/lib/qr";
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
 * Bike statuses a ticket can't be opened against: unbuilt bikes have no
 * physical bike to repair (build defects belong on the build workbench),
 * terminal bikes are gone. Mirrors the picker filter in load-pickables.ts —
 * this is the server-side enforcement so a stale form or direct call can't
 * bypass it (WO-2026-0004 was once opened against a planning-stage bike).
 */
const UNTICKETABLE_STATUSES = new Set([
  "planning",
  "building",
  "retired",
  "lost_or_stolen",
]);

async function assertTicketableBike(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bikeId: string,
): Promise<{ ok: true } | { ok: false; error: string; field: string }> {
  const t = await getTranslations("errors");
  const { data: bike, error } = await supabase
    .from("bikes")
    .select("id, status, deleted_at")
    .eq("id", bikeId)
    .maybeSingle();
  if (error || !bike || bike.deleted_at != null) {
    return {
      ok: false,
      error: t("ticketCouldNotLoadBike", {
        detail: error?.message ?? t("notFound"),
      }),
      field: "bike_id",
    };
  }
  if (UNTICKETABLE_STATUSES.has(bike.status as string)) {
    const unbuilt = bike.status === "planning" || bike.status === "building";
    return {
      ok: false,
      error: unbuilt ? t("ticketBikeNotBuilt") : t("ticketBikeTerminal"),
      field: "bike_id",
    };
  }
  return { ok: true };
}

/**
 * Parse + validate the fields shared between create and update. Returns
 * either a clean payload or an error description matching SaveTicketResult.
 */
async function parseTicketForm(formData: FormData): Promise<
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
  | { ok: false; error: string; field?: string }
> {
  const t = await getTranslations("errors");
  const bike_id = nullable(formData.get("bike_id"));
  const contactId = nullable(formData.get("reported_by_contact_id"));
  const reporterText = nullable(formData.get("reported_by_text"));
  const sourceRaw = nullable(formData.get("source")) ?? "email";
  const priorityRaw = nullable(formData.get("priority")) ?? "3";
  const description = nullable(formData.get("description"));
  const language = nullable(formData.get("reported_language"));
  const notes = nullable(formData.get("notes"));

  if (!bike_id) {
    return { ok: false, error: t("ticketPickBike"), field: "bike_id" };
  }
  if (!description) {
    return {
      ok: false,
      error: t("ticketDescribeProblem"),
      field: "description",
    };
  }
  if (!contactId && !reporterText) {
    return {
      ok: false,
      error: t("ticketPickContactOrReporter"),
      field: "reported_by_text",
    };
  }

  if (!TICKET_SOURCES.includes(sourceRaw as TicketSource)) {
    return { ok: false, error: t("ticketUnknownSource"), field: "source" };
  }
  const priorityNum = Number(priorityRaw);
  if (
    !Number.isInteger(priorityNum) ||
    !TICKET_PRIORITIES.includes(priorityNum as TicketPriority)
  ) {
    return {
      ok: false,
      error: t("ticketPickPriority"),
      field: "priority",
    };
  }
  if (language && !VALID_LANGUAGES.has(language)) {
    return {
      ok: false,
      error: t("languageDaEn"),
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
  const parsed = await parseTicketForm(formData);
  if (!parsed.ok) return parsed;

  const t = await getTranslations("errors");
  const supabase = await createClient();

  const bikeGate = await assertTicketableBike(supabase, parsed.payload.bike_id);
  if (!bikeGate.ok) return bikeGate;

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
      error: t("ticketCouldNotCreate", {
        detail: insErr?.message ?? t("unknownError"),
      }),
    };
  }

  // P4: tell subscribed roles (workshop, per seeds). Never blocks the save.
  await notifyEvent(supabase, {
    eventKey: "ticket.created",
    entityId: ticket.id,
    buildContent: (lang) =>
      ticketCreatedEmail(lang, {
        ticketNumber,
        description: parsed.payload.description,
        url: `${appOrigin()}/maintenance/tickets/${ticket.id}`,
      }),
  });

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
  const t = await getTranslations("errors");
  if (!ticketId) {
    return { ok: false, error: t("missingTicketId") };
  }
  const parsed = await parseTicketForm(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();

  // Gate only a bike CHANGE — a ticket legitimately opened before its bike
  // retired must stay editable with the bike it has.
  const { data: existing } = await supabase
    .from("maintenance_tickets")
    .select("bike_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (existing?.bike_id !== parsed.payload.bike_id) {
    const bikeGate = await assertTicketableBike(
      supabase,
      parsed.payload.bike_id,
    );
    if (!bikeGate.ok) return bikeGate;
  }

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
    return {
      ok: false,
      error: t("ticketCouldNotUpdate", { detail: updErr.message }),
    };
  }

  revalidatePath("/maintenance/tickets");
  revalidatePath(`/maintenance/tickets/${ticketId}`);
  redirect(`/maintenance/tickets/${ticketId}`);
}
