/**
 * Suggestions for a spoken NOTE (plan-inbox-notes.md, slice 3) — the call
 * planner's sibling. The note is phrased with what was known when it was said
 * (the page, a call that just ended, a visit in the calendar now, the
 * colleagues it could be for), so "this bike" and "this customer" resolve the
 * way the speaker meant them, and the command agent runs in NOTE mode.
 *
 * Proposing is not acting: every suggestion is applied by a person (until
 * *act right away* is switched on for someone, slice 4). The planner also
 * sets who the note is FOR and a reminder's day, on the note itself — those
 * are not actions, they are what makes the note a to-do in the right column.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { danishTime } from "@/lib/calls/days";
import { parseExtraction } from "../extraction";
import { loadInboundSettings } from "../settings";
import { runCommandAgent } from "./agent";

export type PlanNoteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "no_body" | "locked" | "agent" | "save"; detail?: string };

/** A call that ended this long before the note is "the call I just had". */
const LAST_CALL_MINUTES = 15;
/** Notes older than this are not planned by the pass. */
const LOOKBACK_DAYS = 7;
const MAX_PER_RUN = 3;

/** Capabilities in plain words, for the planner to match a to-do to a person. */
const DUTY: Record<string, string> = {
  invoices: "invoicing",
  so: "sales and offers",
  po: "purchasing",
  customers: "customer records",
  agreements: "service agreements",
  maintenance: "repairs and tickets",
  work: "the workshop floor",
  mo: "building bikes",
  paint: "paint orders",
};

function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());
}

const orgLabel = (o: { legal_name: string; display_name_da: string | null; display_name_en: string | null }) =>
  o.display_name_da || o.display_name_en || o.legal_name;

/** Run the agent on one note and store the plan, its addressee and its day. */
export async function planNote(supabase: SupabaseClient, messageId: string): Promise<PlanNoteResult> {
  const { data: note } = await supabase
    .from("inbound_messages")
    .select("id, kind, body_text, received_at, handled_by_person_id, note_context")
    .eq("id", messageId)
    .maybeSingle();
  if (!note || note.kind !== "note") return { ok: false, reason: "not_found" };
  if (!note.body_text?.trim()) return { ok: false, reason: "no_body" };

  // Positional plan ids: never re-plan once something was applied.
  const { count } = await supabase
    .from("command_actions")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId);
  if ((count ?? 0) > 0) return { ok: false, reason: "locked" };

  const task = await buildNoteTask(supabase, note);
  const settings = await loadInboundSettings(supabase);
  const result = await runCommandAgent(supabase, task.text, {
    model: settings.extractionModel,
    today: today(),
    mode: "note",
  });
  if (!result.ok) return { ok: false, reason: "agent", detail: result.detail ?? result.reason };
  const plan = result.plan;

  // Only a colleague from the list, and never the speaker, can be the addressee.
  const forPerson =
    plan.forPersonId && task.colleagueIds.has(plan.forPersonId) && plan.forPersonId !== note.handled_by_person_id
      ? plan.forPersonId
      : null;
  const { error } = await supabase
    .from("inbound_messages")
    .update({
      command_plan: { ...plan, forPersonId: forPerson },
      plan_attempted_at: new Date().toISOString(),
      addressed_to_person_id: forPerson,
      due_date: plan.dueDate ?? null,
    })
    .eq("id", messageId);
  if (error) return { ok: false, reason: "save", detail: error.message };
  return { ok: true };
}

/**
 * The pass the import job runs every five minutes: notes read but never
 * planned (a planner that failed after a save, or a note saved while the
 * model was down). Claimed by stamping `plan_attempted_at` first.
 */
export async function draftNotePlans(supabase: SupabaseClient): Promise<{ planned: number; failed: string[] }> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: rows } = await supabase
    .from("inbound_messages")
    .select("id")
    .eq("kind", "note")
    .eq("status", "understood")
    .is("plan_attempted_at", null)
    .not("disposition", "in", "(handled,spam)")
    .not("body_text", "is", null)
    .gte("received_at", since)
    .order("received_at", { ascending: true })
    .limit(MAX_PER_RUN);
  let planned = 0;
  const failed: string[] = [];
  for (const r of rows ?? []) {
    const { data: claimed } = await supabase
      .from("inbound_messages")
      .update({ plan_attempted_at: new Date().toISOString() })
      .eq("id", r.id)
      .is("plan_attempted_at", null)
      .select("id");
    if (!claimed?.length) continue;
    const p = await planNote(supabase, r.id);
    if (p.ok) planned += 1;
    else failed.push(`${r.id}: ${p.reason}${p.detail ? ` (${p.detail})` : ""}`);
  }
  return { planned, failed };
}

/** The note, and what was known when it was said, as one text for the agent. */
async function buildNoteTask(
  supabase: SupabaseClient,
  note: {
    body_text: string | null;
    received_at: string;
    handled_by_person_id: string | null;
    note_context: unknown;
  },
): Promise<{ text: string; colleagueIds: Set<string> }> {
  const ctx = (note.note_context ?? {}) as { path?: unknown; bikeId?: unknown; organizationId?: unknown };
  const saidAt = new Date(note.received_at);
  const lines: string[] = [];

  const { data: people } = await supabase
    .from("people")
    .select("id, full_name, person_roles(roles(name_en, role_capabilities(capability)))")
    .eq("is_active", true)
    .eq("is_system", false);
  type R = { name_en: string; role_capabilities: { capability: string }[] | null };
  type P = { id: string; full_name: string; person_roles: { roles: R | R[] | null }[] | null };
  const colleagues = (people ?? []) as unknown as P[];
  const speaker = colleagues.find((p) => p.id === note.handled_by_person_id);
  lines.push(`Speaker: ${speaker?.full_name ?? "unknown"}, at ${danishTime(note.received_at)}.`);

  if (typeof ctx.path === "string") lines.push(`They were on the app page ${ctx.path}.`);
  if (typeof ctx.bikeId === "string") {
    const { data: bike } = await supabase
      .from("bikes")
      .select("id, frame_number, owner_organization_id, organizations:owner_organization_id(legal_name, display_name_da, display_name_en)")
      .eq("id", ctx.bikeId)
      .maybeSingle();
    if (bike) {
      const org = (Array.isArray(bike.organizations) ? bike.organizations[0] : bike.organizations) as
        | { legal_name: string; display_name_da: string | null; display_name_en: string | null }
        | null;
      lines.push(
        `That page is bike ${bike.frame_number} (bikeId ${bike.id})` +
          (org && bike.owner_organization_id ? `, owned by ${orgLabel(org)} (organizationId ${bike.owner_organization_id}).` : "."),
      );
    }
  }
  if (typeof ctx.organizationId === "string") {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, legal_name, display_name_da, display_name_en")
      .eq("id", ctx.organizationId)
      .maybeSingle();
    if (org) lines.push(`That page is the customer ${orgLabel(org)} (organizationId ${org.id}).`);
  }

  // "The call I just had": the speaker's latest call that ended shortly before.
  if (note.handled_by_person_id) {
    const { data: calls } = await supabase
      .from("inbound_messages")
      .select("id, received_at, duration_seconds, extraction, body_text, from_identity, matched_bike_id, matched_organization_id, channel_meta")
      .eq("kind", "customer")
      .eq("handled_by_person_id", note.handled_by_person_id)
      .lte("received_at", note.received_at)
      .gte("received_at", new Date(saidAt.getTime() - 3 * 3_600_000).toISOString())
      .order("received_at", { ascending: false })
      .limit(1);
    const call = calls?.[0];
    if (call) {
      const ended = new Date(call.received_at).getTime() + (call.duration_seconds ?? 0) * 1000;
      if (saidAt.getTime() - ended <= LAST_CALL_MINUTES * 60_000) {
        const x = parseExtraction(call.extraction);
        const what = x.callSummary ?? x.problem ?? (call.body_text ?? "").slice(0, 300);
        lines.push(
          `They had a call that ended ${Math.max(0, Math.round((saidAt.getTime() - ended) / 60_000))} min before, with ${call.from_identity ?? "an unknown number"}: "${what}"` +
            (call.matched_bike_id ? ` — matched to bikeId ${call.matched_bike_id}` : "") +
            (call.matched_organization_id ? ` — customer organizationId ${call.matched_organization_id}` : "") +
            ".",
        );
      }
    }
  }

  // A visit in the calendar around now (entries the app created).
  const { data: visits } = await supabase
    .from("calendar_events")
    .select("title, organization_id, starts_at, ends_at, kind")
    .eq("kind", "visit")
    .lte("starts_at", new Date(saidAt.getTime() + 60 * 60_000).toISOString())
    .gte("starts_at", new Date(saidAt.getTime() - 3 * 3_600_000).toISOString())
    .order("starts_at", { ascending: false })
    .limit(1);
  const visit = visits?.[0];
  if (visit) {
    lines.push(
      `The calendar has a visit at ${danishTime(visit.starts_at)}: "${visit.title}"` +
        (visit.organization_id ? ` (organizationId ${visit.organization_id})` : "") +
        ".",
    );
  }

  // What each colleague's roles let them DO, in the app's own words — so
  // "we need to invoice" can point at whoever handles invoices, not a guess
  // from a role name.
  const rolesOf = (p: P) =>
    (p.person_roles ?? []).flatMap((pr) => (Array.isArray(pr.roles) ? pr.roles : pr.roles ? [pr.roles] : []));
  const describe = (p: P) => {
    const roles = rolesOf(p);
    const caps = [...new Set(roles.flatMap((r) => (r.role_capabilities ?? []).map((c) => c.capability)))]
      .map((c) => DUTY[c])
      .filter(Boolean);
    return `${p.full_name} — ${roles.map((r) => r.name_en).join(", ") || "no role"}${caps.length ? `; handles: ${caps.join(", ")}` : ""} (id ${p.id})`;
  };
  lines.push(
    "Colleagues (for forPersonId — a task belongs to the colleague who HANDLES it; if the speaker does not handle it, it is for someone who does): " +
      colleagues.map(describe).join("; ") +
      ".",
  );

  return {
    text: `Note:\n${(note.body_text ?? "").trim()}\n\nContext:\n${lines.join("\n")}`,
    colleagueIds: new Set(colleagues.map((p) => p.id)),
  };
}
