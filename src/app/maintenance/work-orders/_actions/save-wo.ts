"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { readCanSeeCosts } from "@/lib/auth/read-session";
import {
  createWorkOrderInternal,
  type CreateWOPayload,
} from "@/lib/maintenance/create-work-order";
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

/** Minutes as a non-negative integer; blank → null. */
function parseLaborMinutes(raw: string | null): number | null | "invalid" {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return "invalid";
  return n;
}

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

  // PARTIAL update: only the fields the caller actually sent are written. The
  // office form posts every key; the technician's workspace posts only its
  // text fields — and writing the rest as NULL is how every tech save used to
  // wipe the labour, the rate and the customer summaries and force the order
  // billable under a service agreement (found 2026-09-27).
  const patch: Record<string, unknown> = {};
  for (const key of [
    "diagnosis",
    "work_performed",
    "customer_summary_en",
    "customer_summary_da",
  ] as const) {
    if (formData.has(key)) patch[key] = nullable(formData.get(key));
  }

  if (formData.has("language")) {
    const languageRaw = nullable(formData.get("language")) ?? "da";
    if (!VALID_LANGUAGES.has(languageRaw)) {
      return { ok: false, error: t("languageDaEn"), field: "language" };
    }
    patch.language = languageRaw;
  }

  if (formData.has("labor_minutes")) {
    const parsed = parseLaborMinutes(nullable(formData.get("labor_minutes")));
    if (parsed === "invalid") {
      return {
        ok: false,
        error: t("woLaborMinutesInteger"),
        field: "labor_minutes",
      };
    }
    patch.labor_minutes = parsed;
  }

  // The rate and the billable flag are money: a viewer without `costs` may
  // not set them, whatever the form posts.
  const moneyKeys = ["labor_rate_dkk", "is_billable"].filter((k) =>
    formData.has(k),
  );
  if (moneyKeys.length > 0 && !(await readCanSeeCosts())) {
    return { ok: false, error: t("noCostsCapability") };
  }

  if (formData.has("labor_rate_dkk")) {
    const laborRateRaw = nullable(formData.get("labor_rate_dkk"));
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
    patch.labor_rate_dkk = laborRate;
  }

  if (formData.has("is_billable")) {
    // Checkboxes post their value when checked and nothing when unchecked, so
    // the office form always emits one of these sentinels via a hidden field.
    const isBillableRaw = formData.get("is_billable");
    patch.is_billable =
      isBillableRaw === "true" || isBillableRaw === "on" || isBillableRaw === "1";
  }

  const { error: updErr } = await supabase
    .from("work_orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", woId);
  if (updErr) {
    return {
      ok: false,
      error: t("woCouldNotSaveDetails", { detail: updErr.message }),
    };
  }

  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${woId}`);
  // The workshop's own screen shows the same details (/work/<wo>).
  revalidatePath(`/work/${woId}`);
  return { ok: true, workOrderId: woId };
}

