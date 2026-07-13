"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  ticketTransitionRequiresReason,
  validNextTicketStatuses,
  type TicketStatus,
} from "@/lib/maintenance/ticket-status";

export type TicketTransitionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Move a ticket from its current status to `toStatus`. Validates the
 * transition matrix; cancelling requires a reason which is prepended to the
 * notes column for the audit trail (no dedicated ticket_state_log yet).
 *
 * Side effects:
 *   - Entering `resolved` for the first time stamps `resolved_at = NOW()`.
 *   - Cancelling appends `[Cancelled YYYY-MM-DD: <reason>]` to notes.
 */
export async function transitionTicket(
  ticketId: string,
  toStatus: TicketStatus,
  reason: string | null,
): Promise<TicketTransitionResult> {
  const t = await getTranslations("errors");
  if (!ticketId) return { ok: false, error: t("missingTicketId") };

  const supabase = await createClient();
  const { data: ticket, error: lookupErr } = await supabase
    .from("maintenance_tickets")
    .select("id, status, resolved_at, notes")
    .eq("id", ticketId)
    .maybeSingle();
  if (lookupErr || !ticket) {
    return {
      ok: false,
      error: t("ticketCouldNotLoad", {
        detail: lookupErr?.message ?? t("notFound"),
      }),
    };
  }

  const fromStatus = ticket.status as TicketStatus;
  if (fromStatus === toStatus) {
    return { ok: false, error: t("alreadyInState") };
  }
  if (!validNextTicketStatuses(fromStatus).includes(toStatus)) {
    return {
      ok: false,
      error: t("ticketCannotMove", { from: fromStatus, to: toStatus }),
    };
  }

  const trimmedReason = reason?.trim() ?? "";
  if (ticketTransitionRequiresReason(toStatus) && trimmedReason === "") {
    return {
      ok: false,
      error: t("reasonRequiredCancel"),
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const newResolvedAt =
    toStatus === "resolved" && !ticket.resolved_at ? nowIso : ticket.resolved_at;

  const newNotes =
    toStatus === "cancelled" && trimmedReason !== ""
      ? `[Cancelled ${today}: ${trimmedReason}]\n${ticket.notes ?? ""}`.trim()
      : ticket.notes;

  const { error: updErr } = await supabase
    .from("maintenance_tickets")
    .update({
      status: toStatus,
      resolved_at: newResolvedAt,
      notes: newNotes,
      updated_at: nowIso,
    })
    .eq("id", ticketId);
  if (updErr) {
    return {
      ok: false,
      error: t("ticketCouldNotUpdateStatus", { detail: updErr.message }),
    };
  }

  revalidatePath("/maintenance/tickets");
  revalidatePath(`/maintenance/tickets/${ticketId}`);
  return { ok: true };
}
