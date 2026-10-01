"use server";

import { readPersonId } from "@/lib/auth/read-session";
import { parseAssistantAnswer, type AssistantAnswer } from "@/lib/assistant/answer";
import { mayReadCommand, readCallsScope } from "@/lib/calls/access";
import { parseCommandPlan, type CommandPlan } from "@/lib/inbound/command/plan";
import { loadPlanContext, type PlanContext } from "@/lib/inbound/command/plan-context";
import { createServiceClient } from "@/lib/supabase/service";

export type AssistantView =
  | { ok: true; status: string; error: string | null; answer: AssistantAnswer | null; plan: CommandPlan; ctx: PlanContext }
  | { ok: false };

/**
 * One request, as the floating panel shows it: the answer, the drafted
 * actions and what their cards need. The same access rule as /commands —
 * the asker, or `inbox` (`mayReadCommand`) — because the service client
 * reads past RLS.
 */
export async function loadAssistantView(id: string): Promise<AssistantView> {
  const supabase = createServiceClient();
  const { data: msg } = await supabase
    .from("inbound_messages")
    .select("id, kind, status, error, commanded_by, assistant_answer, command_plan")
    .eq("id", id)
    .maybeSingle();
  if (!msg || msg.kind !== "command") return { ok: false };
  if (!mayReadCommand(await readCallsScope(), await readPersonId(), msg)) return { ok: false };
  return {
    ok: true,
    status: msg.status,
    error: msg.error,
    answer: parseAssistantAnswer(msg.assistant_answer),
    plan: parseCommandPlan(msg.command_plan),
    ctx: await loadPlanContext(supabase, id),
  };
}
