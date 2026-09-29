import "server-only";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { findActiveAgreementForBike } from "@/lib/agreements/coverage";
import { createClient } from "@/lib/supabase/server";

/*
 * The one way a work order is created. A plain module, NOT a "use server"
 * file: every export of one of those is a callable endpoint, and this helper
 * has no gate of its own — its callers (the office form, ticket conversion,
 * the floor's "New work order") each check what they need first.
 */

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
): Promise<{
  agreementId: string | null;
  lineId: string | null;
  isBillable: boolean;
}> {
  const agreement = await findActiveAgreementForBike(supabase, bikeId);
  if (!agreement) return { agreementId: null, lineId: null, isBillable: true };
  return {
    agreementId: agreement.id,
    lineId: agreement.line_id,
    isBillable: !(agreement.covers_parts && agreement.covers_labor),
  };
}

export type CreateWOPayload = {
  bike_id: string;
  ticket_id: string | null;
  language: string;
  diagnosis: string | null;
  work_performed: string | null;
};

/**
 * Internal create helper used by both `createWorkOrder` (form path) and
 * `convertTicketToWO` (button on ticket detail). Returns the new WO id but
 * does NOT redirect — the caller decides where to send the user.
 */
export async function createWorkOrderInternal(
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
      covered_by_service_agreement_bike_id: coverage.lineId,
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

