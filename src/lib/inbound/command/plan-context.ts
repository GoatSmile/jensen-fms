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
  };
}
