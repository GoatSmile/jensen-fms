/**
 * One request as the panel and the conversation show it: the answer, the
 * drafted actions and what their cards need. Callers check who may read it
 * (`mayReadCommand`); this does not. Shared by `loadAssistantView` and by
 * `createCommandFromText`, which returns it with the request so the
 * secretary needs no second round trip before it speaks (2026-10-22).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseAssistantAnswer, type AssistantAnswer } from "@/lib/assistant/answer";
import { parseCommandPlan, type CommandPlan } from "@/lib/inbound/command/plan";
import { loadPlanContext, type PlanContext } from "@/lib/inbound/command/plan-context";

export type AssistantView =
  | { ok: true; status: string; error: string | null; answer: AssistantAnswer | null; plan: CommandPlan; ctx: PlanContext }
  | { ok: false };

export type CommandRow = {
  id: string;
  kind: string | null;
  status: string;
  error: string | null;
  commanded_by: string | null;
  assistant_answer: unknown;
  command_plan: unknown;
};

export const COMMAND_VIEW_COLUMNS = "id, kind, status, error, commanded_by, assistant_answer, command_plan";

export async function buildAssistantView(supabase: SupabaseClient, msg: CommandRow): Promise<AssistantView> {
  return {
    ok: true,
    status: msg.status,
    error: msg.error,
    answer: parseAssistantAnswer(msg.assistant_answer),
    plan: parseCommandPlan(msg.command_plan),
    ctx: await loadPlanContext(supabase as never, msg.id),
  };
}
