"use server";

import { getTranslations } from "next-intl/server";

import { readPersonId } from "@/lib/auth/read-session";
import { readCallsScope, scopeAllowsRow } from "@/lib/calls/access";
import { revalidateInbound } from "@/lib/calls/revalidate";
import { parseCommandPlan } from "@/lib/inbound/command/plan";
import { createServiceClient } from "@/lib/supabase/service";

type Result = { ok: true; ids: string[] } | { ok: false; error: string };

/**
 * Done, for NOTES only (owner, 2026-10-08: calls keep their own handling).
 * Done never applies anything: the suggestions left unapplied are recorded on
 * the note (`dropped_actions`), so "why was this never invoiced?" has an
 * answer. Who may close a note is the read rule — the speaker, the addressee,
 * or anyone with `inbox` — checked per row, because a server action is
 * callable from anywhere.
 */
export async function markNotesDone(ids: string[]): Promise<Result> {
  return setDone(ids, true);
}

/** Undo, and Reopen from the done list: the note is open again, as it was. */
export async function reopenNotes(ids: string[]): Promise<Result> {
  return setDone(ids, false);
}

async function setDone(rawIds: string[], done: boolean): Promise<Result> {
  const t = await getTranslations("errors");
  const ids = [...new Set(rawIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: t("notesNothingSelected") };
  const [scope, personId] = await Promise.all([readCallsScope(), readPersonId()]);
  if (!scope || !personId) return { ok: false, error: t("notesNotAllowed") };

  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("inbound_messages")
    .select("id, kind, handled_by_person_id, addressed_to_person_id, command_plan")
    .in("id", ids);
  if (error) return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  const allowed = (rows ?? []).filter((r) => r.kind === "note" && scopeAllowsRow(scope, r));
  if (allowed.length === 0) return { ok: false, error: t("notesNotAllowed") };

  if (!done) {
    const { error: upErr } = await supabase
      .from("inbound_messages")
      .update({ disposition: "pending", closed_at: null, closed_by: null, dropped_actions: null })
      .in("id", allowed.map((r) => r.id));
    if (upErr) return { ok: false, error: t("couldNotSave", { detail: upErr.message }) };
  } else {
    const { data: ledger } = await supabase
      .from("command_actions")
      .select("message_id, plan_action_id")
      .in("message_id", allowed.map((r) => r.id));
    const appliedBy = new Map<string, Set<string>>();
    for (const a of ledger ?? []) {
      const set = appliedBy.get(a.message_id) ?? new Set<string>();
      set.add(a.plan_action_id);
      appliedBy.set(a.message_id, set);
    }
    const now = new Date().toISOString();
    // One update per note: each records its own dropped suggestions.
    for (const r of allowed) {
      const applied = appliedBy.get(r.id) ?? new Set<string>();
      const dropped = r.command_plan
        ? parseCommandPlan(r.command_plan).actions.map((a) => a.id).filter((id) => !applied.has(id))
        : [];
      const { error: upErr } = await supabase
        .from("inbound_messages")
        .update({
          disposition: "handled",
          closed_at: now,
          closed_by: personId,
          dropped_actions: dropped.length ? dropped : null,
        })
        .eq("id", r.id);
      if (upErr) return { ok: false, error: t("couldNotSave", { detail: upErr.message }) };
    }
  }

  revalidateInbound();
  return { ok: true, ids: allowed.map((r) => r.id) };
}
