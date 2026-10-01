/**
 * What a suggestions card needs beyond the plan: which actions are already
 * applied, and the pick-lists for its open slots (bike models, segments,
 * colours). One loader for every surface that shows suggestions — the call /
 * command page and the assistant's floating panel. Server-only.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanContext = {
  applied: Record<string, { entityTable: string | null; entityId: string | null }>;
  templates: { id: string; label: string }[];
  segments: { id: string; label: string }[];
  colors: { id: string; label: string }[];
  /** Every active customer, for the "Which customer?" slot. */
  customers: { id: string; label: string }[];
  /** Close spellings of the name that was said (migration 121), best first —
   *  shown above the full list, never chosen for the person. */
  suggestedCustomers: { id: string; label: string }[];
};

/**
 * Open-slot vocabulary + applied-state for the CommandPlanPanel. Shared by
 * both surfaces that render a plan: the VC-1 command page, and a sales
 * enquiry's plan on an ordinary inbound message (P2).
 */
export async function loadPlanContext(
  supabase: SupabaseClient,
  messageId: string,
): Promise<PlanContext> {
  const [{ data: actions }, { data: templates }, { data: segments }, { data: colors }] =
    await Promise.all([
      supabase
        .from("command_actions")
        .select("plan_action_id, entity_table, entity_id")
        .eq("message_id", messageId),
      supabase
        .from("bike_templates")
        .select("id, name_en, name_da, frame_size")
        .eq("is_current", true)
        .order("name_en"),
      supabase
        .from("customer_segments")
        .select("id, name_en, name_da")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("colors")
        .select("id, name_en, name_da")
        .eq("is_active", true)
        .order("sort_order"),
    ]);
  const pick = (en: string | null, da: string | null) => da || en || "—";

  // The name as said: the call's extraction, and any unresolved customer on
  // the plan (the agent's organizationLabel). Each gets its close spellings;
  // the matcher's own candidates for the call come first.
  const { data: msg } = await supabase
    .from("inbound_messages")
    .select("extraction, command_plan, match_candidates")
    .eq("id", messageId)
    .maybeSingle();
  const said = new Set<string>();
  const ex = (msg?.extraction ?? null) as { organizationName?: string | null } | null;
  if (ex?.organizationName) said.add(ex.organizationName);
  for (const a of ((msg?.command_plan as { actions?: { organizationId?: string | null; organizationLabel?: string | null }[] } | null)?.actions ?? [])) {
    if (!a.organizationId && a.organizationLabel) said.add(a.organizationLabel);
  }
  const suggested = new Map<string, string>();
  for (const o of ((msg?.match_candidates as { organizations?: { id: string; name: string }[] } | null)?.organizations ?? [])) {
    suggested.set(o.id, o.name);
  }
  const [customerRows, ...fuzzy] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, legal_name, display_name_da, display_name_en")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("legal_name")
      .limit(2000),
    ...[...said].map((q) => supabase.rpc("search_organizations_fuzzy", { q, lim: 5 })),
  ]);
  for (const r of fuzzy) {
    for (const c of (r.data ?? []) as { id: string; label: string }[]) if (!suggested.has(c.id)) suggested.set(c.id, c.label);
  }
  const applied: PlanContext["applied"] = {};
  for (const a of actions ?? []) {
    applied[a.plan_action_id] = { entityTable: a.entity_table, entityId: a.entity_id };
  }
  return {
    applied,
    templates: (templates ?? []).map((tpl) => ({
      id: tpl.id,
      label: [pick(tpl.name_en, tpl.name_da), tpl.frame_size].filter(Boolean).join(" · "),
    })),
    segments: (segments ?? []).map((s) => ({ id: s.id, label: pick(s.name_en, s.name_da) })),
    colors: (colors ?? []).map((c) => ({ id: c.id, label: pick(c.name_en, c.name_da) })),
    customers: (customerRows.data ?? []).map((o) => ({
      id: o.id,
      label: o.display_name_da || o.display_name_en || o.legal_name,
    })),
    suggestedCustomers: [...suggested].slice(0, 6).map(([id, label]) => ({ id, label })),
  };
}
