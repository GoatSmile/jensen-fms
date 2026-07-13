"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { findActiveAgreementForBike } from "@/lib/agreements/coverage";
import { nullableString as nullable } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import type { TicketStatus } from "@/lib/maintenance/ticket-status";
import {
  CLOSED_WO_STATUSES,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";

export type SaveWOResult =
  | { ok: true; workOrderId: string }
  | { ok: false; error: string; field?: string };

const VALID_LANGUAGES = new Set(["da", "en"]);

/**
 * Coverage stamp for a new work order, resolved through the shared
 * bike-coverage rule (`src/lib/agreements/coverage.ts`):
 *   is_billable = NOT (covers_parts AND covers_labor)
 *
 * Per-bucket coverage (parts vs labor) is applied at invoicing; a partially
 * covered WO stays billable here.
 */
async function findActiveCoverageForBike(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bikeId: string,
): Promise<{ agreementId: string | null; isBillable: boolean }> {
  const agreement = await findActiveAgreementForBike(supabase, bikeId);
  if (!agreement) return { agreementId: null, isBillable: true };
  return {
    agreementId: agreement.id,
    isBillable: !(agreement.covers_parts && agreement.covers_labor),
  };
}

type CreateWOPayload = {
  bike_id: string;
  ticket_id: string | null;
  language: string;
  diagnosis: string | null;
  work_performed: string | null;
};

async function parseCreateForm(
  formData: FormData,
): Promise<
  | { ok: true; payload: CreateWOPayload }
  | { ok: false; error: string; field?: string }
> {
  const t = await getTranslations("errors");
  const bike_id = nullable(formData.get("bike_id"));
  const ticket_id = nullable(formData.get("ticket_id"));
  const languageRaw = nullable(formData.get("language")) ?? "da";
  const diagnosis = nullable(formData.get("diagnosis"));
  const work_performed = nullable(formData.get("work_performed"));

  if (!bike_id) {
    return { ok: false, error: t("woPickBike"), field: "bike_id" };
  }
  if (!VALID_LANGUAGES.has(languageRaw)) {
    return { ok: false, error: t("languageDaEn"), field: "language" };
  }
  return {
    ok: true,
    payload: {
      bike_id,
      ticket_id,
      language: languageRaw,
      diagnosis,
      work_performed,
    },
  };
}

/**
 * Internal create helper used by both `createWorkOrder` (form path) and
 * `convertTicketToWO` (button on ticket detail). Returns the new WO id but
 * does NOT redirect — the caller decides where to send the user.
 */
async function createWorkOrderInternal(
  payload: CreateWOPayload,
): Promise<{ ok: true; workOrderId: string } | { ok: false; error: string }> {
  const t = await getTranslations("errors");
  const supabase = await createClient();

  const { data: woNumber, error: numErr } = await supabase.rpc(
    "next_document_number",
    { p_doc_type: "work_order" },
  );
  if (numErr || typeof woNumber !== "string") {
    return {
      ok: false,
      error: t("woCouldNotAllocateNumber", {
        detail: numErr?.message ?? t("unknownError"),
      }),
    };
  }

  const coverage = await findActiveCoverageForBike(supabase, payload.bike_id);

  const { data: wo, error: insErr } = await supabase
    .from("work_orders")
    .insert({
      wo_number: woNumber,
      bike_id: payload.bike_id,
      ticket_id: payload.ticket_id,
      language: payload.language,
      diagnosis: payload.diagnosis,
      work_performed: payload.work_performed,
      covered_by_service_agreement_id: coverage.agreementId,
      is_billable: coverage.isBillable,
      status: "open",
    })
    .select("id")
    .single();
  if (insErr || !wo) {
    return {
      ok: false,
      error: t("woCouldNotCreate", {
        detail: insErr?.message ?? t("unknownError"),
      }),
    };
  }

  revalidatePath("/maintenance/work-orders");
  if (payload.ticket_id) {
    revalidatePath(`/maintenance/tickets/${payload.ticket_id}`);
  }
  return { ok: true, workOrderId: wo.id };
}

/**
 * Create a new work order from the form. Redirects to its detail page on
 * success. Document number comes from `next_document_number('work_order')`.
 */
export async function createWorkOrder(formData: FormData): Promise<SaveWOResult> {
  const parsed = await parseCreateForm(formData);
  if (!parsed.ok) return parsed;

  const result = await createWorkOrderInternal(parsed.payload);
  if (!result.ok) return { ok: false, error: result.error };

  redirect(`/maintenance/work-orders/${result.workOrderId}`);
}

/**
 * Convert a ticket to a work order — convenience action used by the ticket
 * detail "Start work order" button. Auto-advances the ticket to `in_repair`
 * if it's currently in an early-lifecycle state. Redirects to the new WO.
 */
export async function convertTicketToWO(
  ticketId: string,
): Promise<SaveWOResult> {
  const t = await getTranslations("errors");
  if (!ticketId) return { ok: false, error: t("missingTicketId") };

  const supabase = await createClient();
  const { data: ticket, error: tErr } = await supabase
    .from("maintenance_tickets")
    .select("id, status, bike_id, reported_language")
    .eq("id", ticketId)
    .maybeSingle();
  if (tErr || !ticket) {
    return {
      ok: false,
      error: t("ticketCouldNotLoad", { detail: tErr?.message ?? t("notFound") }),
    };
  }
  if (!ticket.bike_id) {
    return { ok: false, error: t("woTicketNoBike") };
  }

  const language =
    ticket.reported_language && VALID_LANGUAGES.has(ticket.reported_language)
      ? ticket.reported_language
      : "da";

  const result = await createWorkOrderInternal({
    bike_id: ticket.bike_id,
    ticket_id: ticket.id,
    language,
    diagnosis: null,
    work_performed: null,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Auto-advance the ticket to in_repair if it's still early-lifecycle. We
  // do this inline rather than via transitionTicket() so we can be lenient
  // about the source status (open/in_diagnosis/awaiting_parts → in_repair
  // isn't a single matrix edge — it's a "the work has started" signal).
  const fromStatus = ticket.status as TicketStatus;
  const advanceableFrom: TicketStatus[] = [
    "open",
    "in_diagnosis",
    "awaiting_parts",
  ];
  if (advanceableFrom.includes(fromStatus)) {
    await supabase
      .from("maintenance_tickets")
      .update({
        status: "in_repair",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId);
    revalidatePath(`/maintenance/tickets/${ticketId}`);
    revalidatePath("/maintenance/tickets");
  }

  redirect(`/maintenance/work-orders/${result.workOrderId}`);
}

/**
 * Patch the editable detail fields of a work order. Refuses when the WO is
 * completed or cancelled (use the move-to dropdown to re-open via a new WO
 * if that ever becomes a real workflow).
 */
export async function updateWODetails(
  woId: string,
  formData: FormData,
): Promise<SaveWOResult> {
  const t = await getTranslations("errors");
  if (!woId) return { ok: false, error: t("missingWorkOrderId") };

  const supabase = await createClient();
  const { data: existing, error: lookupErr } = await supabase
    .from("work_orders")
    .select("id, status")
    .eq("id", woId)
    .maybeSingle();
  if (lookupErr || !existing) {
    return {
      ok: false,
      error: t("woCouldNotLoad", {
        detail: lookupErr?.message ?? t("notFound"),
      }),
    };
  }
  if (CLOSED_WO_STATUSES.includes(existing.status as WorkOrderStatus)) {
    return {
      ok: false,
      error: t("woClosedDetails"),
    };
  }

  const diagnosis = nullable(formData.get("diagnosis"));
  const work_performed = nullable(formData.get("work_performed"));
  const customer_summary_en = nullable(formData.get("customer_summary_en"));
  const customer_summary_da = nullable(formData.get("customer_summary_da"));
  const languageRaw = nullable(formData.get("language")) ?? "da";
  const laborMinutesRaw = nullable(formData.get("labor_minutes"));
  const laborRateRaw = nullable(formData.get("labor_rate_dkk"));
  const isBillableRaw = formData.get("is_billable");

  if (!VALID_LANGUAGES.has(languageRaw)) {
    return { ok: false, error: t("languageDaEn"), field: "language" };
  }

  let laborMinutes: number | null = null;
  if (laborMinutesRaw != null) {
    const n = Number(laborMinutesRaw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return {
        ok: false,
        error: t("woLaborMinutesInteger"),
        field: "labor_minutes",
      };
    }
    laborMinutes = n;
  }
  let laborRate: number | null = null;
  if (laborRateRaw != null) {
    const n = Number(laborRateRaw);
    if (!Number.isFinite(n) || n < 0) {
      return {
        ok: false,
        error: t("woLaborRateNonNegative"),
        field: "labor_rate_dkk",
      };
    }
    laborRate = n;
  }

  // Checkboxes post their value when checked and nothing when unchecked. The
  // form always emits one of these two sentinels via a hidden field for
  // unambiguous handling.
  const isBillable =
    isBillableRaw === "true" || isBillableRaw === "on" || isBillableRaw === "1";

  const { error: updErr } = await supabase
    .from("work_orders")
    .update({
      diagnosis,
      work_performed,
      customer_summary_en,
      customer_summary_da,
      language: languageRaw,
      labor_minutes: laborMinutes,
      labor_rate_dkk: laborRate,
      is_billable: isBillable,
      updated_at: new Date().toISOString(),
    })
    .eq("id", woId);
  if (updErr) {
    return {
      ok: false,
      error: t("woCouldNotSaveDetails", { detail: updErr.message }),
    };
  }

  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${woId}`);
  return { ok: true, workOrderId: woId };
}

