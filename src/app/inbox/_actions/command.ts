"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/types/database";
import { readGate } from "@/lib/auth/read-session";
import { loadInboundSettings } from "@/lib/inbound/settings";
import { runCommandAgent } from "@/lib/inbound/command/agent";
import {
  parseCommandPlan,
  type CommandAction,
  unfilledRequiredSlots,
} from "@/lib/inbound/command/plan";
import {
  insertDraftOrganization,
  insertDraftSalesOrder,
} from "@/lib/commercial/draft-writers";
import { createDraftPOsForDemand } from "@/lib/purchasing/draft-pos";

export type CommandResult = { ok: true; id: string } | { ok: false; error: string };
export type ApplyResult =
  | { ok: true; entityTable: string | null; entityId: string | null }
  | { ok: false; error: string };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The logged-in person id, when a role session carries one (post-P3). */
async function currentPersonId(): Promise<string | null> {
  const gate = await readGate();
  return gate.kind === "role" ? (gate.session.person ?? null) : null;
}

/**
 * In-app command ingress (VC-1, Option A — text-first). Create a kind='command'
 * inbound row from dictated/typed text, then run the command agent and store
 * its plan. The command path SKIPS extract → match → triage (a staff command
 * from an unknown number would score as spam); the agent is its own stage.
 */
export async function createCommandFromText(text: string): Promise<CommandResult> {
  const t = await getTranslations("errors");
  const body = text.trim();
  if (!body) return { ok: false, error: t("inboundNoBody") };

  const supabase = createServiceClient();
  const personId = await currentPersonId();

  const { data: inserted, error: insErr } = await supabase
    .from("inbound_messages")
    .insert({
      channel: "in_app",
      kind: "command",
      status: "understood",
      body_text: body,
      commanded_by: personId,
      channel_meta: { source: "in_app_command" },
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    return {
      ok: false,
      error: t("inboundCouldNotSave", { detail: insErr?.message ?? t("unknownError") }),
    };
  }

  await runAndStorePlan(supabase, inserted.id, body);
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${inserted.id}`);
  return { ok: true, id: inserted.id };
}

/** Re-run the agent on an existing command row's body_text (e.g. after edit). */
export async function rerunCommandAgent(messageId: string): Promise<CommandResult> {
  const t = await getTranslations("errors");
  const supabase = createServiceClient();
  const { data: msg } = await supabase
    .from("inbound_messages")
    .select("id, body_text, kind")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { ok: false, error: t("missingId") };
  if (msg.kind !== "command") return { ok: false, error: t("missingId") };

  await runAndStorePlan(supabase, messageId, msg.body_text ?? "");
  revalidatePath(`/inbox/${messageId}`);
  return { ok: true, id: messageId };
}

/** Run the agent and stamp the plan (or the failure) onto the row. */
async function runAndStorePlan(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  body: string,
): Promise<void> {
  const settings = await loadInboundSettings(supabase);
  const result = await runCommandAgent(supabase, body, {
    model: settings.extractionModel,
    today: today(),
  });
  if (!result.ok) {
    await supabase
      .from("inbound_messages")
      .update({
        status: "failed",
        command_plan: null,
        error: `command.${result.reason}${result.detail ? `: ${result.detail}` : ""}`,
      })
      .eq("id", messageId);
    return;
  }
  await supabase
    .from("inbound_messages")
    .update({
      command_plan: result.plan,
      status: "matched",
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", messageId);
}

/**
 * Apply ONE proposed action → the real draft, logging a command_actions row
 * (provenance) and blocking double-apply via the unique (message, action)
 * index. `filled` carries the reviewer's open-slot picks (template / segment /
 * colour ids). A sales order that references a new customer requires that
 * customer's action to be applied first.
 */
export async function applyCommandAction(
  messageId: string,
  actionId: string,
  filled: Record<string, string>,
): Promise<ApplyResult> {
  const t = await getTranslations("errors");
  const supabase = createServiceClient();

  const { data: msg } = await supabase
    .from("inbound_messages")
    .select("id, command_plan")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return { ok: false, error: t("missingId") };

  const plan = parseCommandPlan(msg.command_plan);
  const action = plan.actions.find((a) => a.id === actionId);
  if (!action) return { ok: false, error: t("commandActionNotFound") };

  // Already applied? (idempotent — the unique index also guards the race.)
  const { data: existing } = await supabase
    .from("command_actions")
    .select("entity_table, entity_id")
    .eq("message_id", messageId)
    .eq("plan_action_id", actionId)
    .maybeSingle();
  if (existing) {
    return { ok: true, entityTable: existing.entity_table, entityId: existing.entity_id };
  }

  // All non-optional open slots must be filled before we write.
  const missing = unfilledRequiredSlots(action, filled);
  if (missing.length > 0) {
    return { ok: false, error: t("commandSlotsUnfilled") };
  }

  const write = await performAction(supabase, messageId, plan.actions, action, filled, t);
  if (!write.ok) return write;

  const personId = await currentPersonId();
  const { error: logErr } = await supabase.from("command_actions").insert({
    message_id: messageId,
    plan_action_id: actionId,
    action_type: action.type,
    entity_table: write.entityTable,
    entity_id: write.entityId,
    payload: write.payload,
    applied_by: personId,
  });
  if (logErr) {
    // The draft exists; the provenance row didn't. Surface it (the draft is
    // real and visible), don't roll back.
    return { ok: false, error: t("couldNotSave", { detail: logErr.message }) };
  }

  // If every action now has a command_actions row, the command is done.
  const { count } = await supabase
    .from("command_actions")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId);
  if ((count ?? 0) >= plan.actions.length) {
    await supabase
      .from("inbound_messages")
      .update({ status: "actioned" })
      .eq("id", messageId);
  }

  revalidatePath(`/inbox/${messageId}`);
  revalidatePath("/inbox");
  return { ok: true, entityTable: write.entityTable, entityId: write.entityId };
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

type PerformResult =
  | { ok: true; entityTable: string; entityId: string | null; payload: Json }
  | { ok: false; error: string };

/** Dispatch one action to its pure draft writer. */
async function performAction(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string,
  allActions: CommandAction[],
  action: CommandAction,
  filled: Record<string, string>,
  t: Translator,
): Promise<PerformResult> {
  switch (action.type) {
    case "draft_customer": {
      const segmentId = action.segmentId ?? filled.segment;
      if (!segmentId) return { ok: false, error: t("commandSlotsUnfilled") };
      const r = await insertDraftOrganization(supabase, {
        legalName: action.legalName,
        customerSegmentId: segmentId,
        preferredLanguage: action.preferredLanguage,
      });
      if (!r.ok) return { ok: false, error: t("orgCouldNotCreate", { detail: r.error }) };
      return {
        ok: true,
        entityTable: "organizations",
        entityId: r.id,
        payload: { legalName: action.legalName, customerSegmentId: segmentId },
      };
    }

    case "draft_sales_order": {
      // Resolve the customer: an existing org, or the one a sibling
      // draft_customer action created (which must be applied first).
      let organizationId = action.organizationId;
      if (!organizationId && action.organizationFromNewCustomer) {
        const custAction = allActions.find((a) => a.type === "draft_customer");
        if (!custAction) return { ok: false, error: t("commandNeedsCustomer") };
        const { data: applied } = await supabase
          .from("command_actions")
          .select("entity_id")
          .eq("message_id", messageId)
          .eq("plan_action_id", custAction.id)
          .eq("entity_table", "organizations")
          .maybeSingle();
        if (!applied?.entity_id) {
          return { ok: false, error: t("commandApplyCustomerFirst") };
        }
        organizationId = applied.entity_id;
      }
      if (!organizationId) return { ok: false, error: t("commandNeedsCustomer") };

      const templateId = action.templateId ?? filled.template;
      if (!templateId) return { ok: false, error: t("commandSlotsUnfilled") };
      const colorId = action.colorId ?? filled.color ?? null;

      const r = await insertDraftSalesOrder(supabase, {
        organizationId,
        language: action.language,
        currency: action.currency,
        orderDate: action.orderDate ?? today(),
        deliveryDate: action.deliveryDate,
        deliveryPrecision: action.deliveryPrecision,
        productionNote: action.productionNote,
        line: {
          quantity: action.quantity,
          templateId,
          colorId,
          unitPrice: action.unitPrice,
        },
      });
      if (!r.ok) return { ok: false, error: t("soCouldNotCreate", { detail: r.error }) };
      return {
        ok: true,
        entityTable: "sales_orders",
        entityId: r.id,
        payload: { number: r.number, organizationId, templateId, colorId, quantity: action.quantity },
      };
    }

    case "draft_purchase_order": {
      const demands = action.items.map((it) => ({
        partId: it.partId,
        sku: it.partLabel,
        name: it.partLabel,
        quantity: it.quantity,
        lineNote: action.note ?? "Drafted from a voice command.",
      }));
      const r = await createDraftPOsForDemand(
        supabase,
        demands,
        action.note ?? "Drafted from a voice command — review before placing.",
      );
      if (!r.ok) return { ok: false, error: r.error };
      // One or more POs; log the first as the entity link, all in the payload.
      const first = r.pos[0] ?? null;
      return {
        ok: true,
        entityTable: "purchase_orders",
        entityId: first?.id ?? null,
        payload: { pos: r.pos, skipped: r.skipped },
      };
    }
  }
}
