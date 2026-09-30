/**
 * The command AGENT — a Claude tool-use LOOP that turns a staff member's
 * dictated/typed task into a proposed CommandPlan of draft actions.
 *
 * Same house plumbing as extract.ts (thin fetch to the Anthropic Messages API,
 * key from env ANTHROPIC_API_KEY, model from app_settings) — but where
 * extraction is a SINGLE forced-tool call, this is a multi-turn loop:
 * tool_choice 'auto', the read-only RESOLVERS ground each reference across
 * turns, and the agent finishes by calling `propose_plan` exactly once. The
 * loop is capped so a confused model can't spin.
 *
 * Design rules it enforces via the system prompt (docs/plan-voice-commands.md):
 * resolve before proposing · never invent (unresolved → leave the field null,
 * the reviewer fills the open slot) · offer-to-create for CUSTOMERS only ·
 * everything is a draft. parseCommandPlan is the real contract enforcer.
 *
 * Server-only (reads process.env). Import from server actions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { parseCommandPlan, type CommandPlan } from "./plan";
import { RESOLVER_TOOLS, RESOLVER_NAMES, executeResolver } from "./resolvers";
import { postMessages } from "@/lib/anthropic/messages";

// Room for adaptive thinking, which the newest models run when the request
// says nothing about it and which counts against max_tokens.
const MAX_TOKENS = 8000;
const MAX_ITERATIONS = 8;

export type CommandAgentResult =
  | { ok: true; plan: CommandPlan }
  | { ok: false; reason: "no_body" | "no_key" | "api_error" | "no_plan"; detail?: string };

const PROPOSE_PLAN_TOOL = {
  name: "propose_plan",
  description:
    "Emit the final plan of proposed DRAFT actions. Call this exactly once, after you have resolved every reference you can. Fill an id field only when a resolver returned exactly one match; leave it null otherwise (the reviewer fills the open slot). Never invent a part, template, or supplier.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "One short grounded paragraph: what you drafted + what still needs a human (open slots). Danish if the task was Danish, else English.",
      },
      notes: {
        type: "array",
        items: { type: "string" },
        description: "Anything you could not do, or a hint for the reviewer.",
      },
      actions: {
        type: "array",
        description: "The proposed draft actions, in apply order (a customer before the sales order that uses it).",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "draft_customer",
                "draft_offer",
                "draft_sales_order",
                "draft_ticket",
                "draft_purchase_order",
              ],
            },
            // draft_customer
            legalName: { type: ["string", "null"], description: "Customer legal/display name." },
            segmentId: { type: ["string", "null"], description: "Resolved customer_segments id, else null." },
            segmentLabel: { type: ["string", "null"] },
            preferredLanguage: { type: ["string", "null"], enum: ["da", "en", null] },
            // draft_sales_order
            organizationId: { type: ["string", "null"], description: "Resolved existing organization id." },
            organizationLabel: { type: ["string", "null"] },
            organizationFromNewCustomer: {
              type: ["boolean", "null"],
              description: "True → use the customer this plan's draft_customer action creates.",
            },
            language: { type: ["string", "null"], enum: ["da", "en", null] },
            currency: { type: ["string", "null"], description: "3-letter, default DKK." },
            orderDate: { type: ["string", "null"], description: "ISO date, else null (today)." },
            deliveryDate: { type: ["string", "null"], description: "ISO date." },
            deliveryPrecision: { type: ["string", "null"], enum: ["exact", "week", null] },
            productionNote: {
              type: ["string", "null"],
              description: "Free-text build instructions (basket, logo colour, …) — flows to the build floor.",
            },
            quantity: { type: ["number", "null"], description: "Number of bikes on the single template line." },
            templateId: { type: ["string", "null"], description: "Resolved bike_templates id, else null." },
            templateLabel: { type: ["string", "null"] },
            colorId: { type: ["string", "null"], description: "Resolved colors id, else null." },
            colorLabel: { type: ["string", "null"] },
            unitPrice: { type: ["number", "null"], description: "Per-bike price, else null (template default)." },
            // draft_offer uses the sales-order fields above (no dates, no
            // productionNote) plus `note` for specification + timing.
            // draft_ticket
            description: {
              type: ["string", "null"],
              description: "draft_ticket: what is wrong with the customer's EXISTING bike, short, in the caller's language.",
            },
            urgency: { type: ["string", "null"], enum: ["low", "normal", "high", null] },
            // draft_purchase_order
            items: {
              type: ["array", "null"],
              description: "Resolved parts to order; supplier is auto-picked from offerings.",
              items: {
                type: "object",
                properties: {
                  partId: { type: "string" },
                  partLabel: { type: "string" },
                  quantity: { type: "number" },
                },
                required: ["partId", "partLabel", "quantity"],
              },
            },
            note: {
              type: ["string", "null"],
              description: "draft_offer: what they said about specification (electric, basket, logo) and timing. draft_purchase_order: a note.",
            },
          },
          required: ["type"],
        },
      },
    },
    required: ["summary", "actions", "notes"],
  },
} as const;

const SYSTEM_PROMPT = `You are the command agent for a Danish workshop that builds and repairs custom-branded bikes (Jensen Production / Logocykler). A staff member has dictated or typed a business task. Your job is to turn it into a PLAN of proposed DRAFT actions for a human to review and apply — you never execute anything yourself.

You can propose five kinds of draft action:
- draft_customer — a new customer organization (+ segment: Hotel, Municipality, Hospital, Facility Management, B2B, B2C).
- draft_offer — a QUOTE for bikes a customer asked about: a customer, a quantity, one bike model (template), optional colour, and a note with the specification and timing they mentioned. Use this, not a sales order, when someone is asking to buy.
- draft_sales_order — a confirmed order for bikes: a customer, a quantity, one bike model (template), optional colour, delivery date, and a production note for build instructions. Only when the staff member says the order is placed.
- draft_ticket — a repair of a bike the customer ALREADY HAS: a short description of the fault and an urgency. Do not look up the bike; it is attached from the call.
- draft_purchase_order — parts to buy. The supplier is chosen automatically from the parts' offerings, so you only resolve the PARTS.

Rules you must follow:
1. RESOLVE BEFORE PROPOSING. Use the resolver tools (search_customer, resolve_customer_segment, resolve_template, resolve_color, search_part, resolve_part_via_recipe) to ground every reference. Only fill an id field when a resolver returned exactly ONE clear match.
2. NEVER INVENT. If a template, part, colour, or segment can't be resolved to one match, leave that id null — the reviewer fills it in. Only for a CUSTOMER that doesn't exist may you propose creating one (draft_customer).
3. A part described by role + model ("motors for Norma XL") → use resolve_part_via_recipe.
4. If the order or offer names a customer that search_customer doesn't find, add a draft_customer action AND set organizationFromNewCustomer=true on it.
5. Everything is a draft — safe to propose. Put build details (basket, logo colour/text, finish) into the sales order's productionNote.
6. Today's date is provided implicitly by the reviewer; if a delivery date has no year, choose the next future occurrence.

When you have resolved everything you can, call propose_plan exactly once. Keep the summary short and grounded: state what you drafted and what still needs the reviewer.`;

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: string; [k: string]: unknown };

/** Run the agent loop over the dictated text. `today` grounds relative dates. */
export async function runCommandAgent(
  supabase: SupabaseClient,
  bodyText: string | null,
  opts: { model: string; today: string },
): Promise<CommandAgentResult> {
  const body = (bodyText ?? "").trim();
  if (!body) return { ok: false, reason: "no_body" };

  const tools = [...RESOLVER_TOOLS, PROPOSE_PLAN_TOOL];
  const messages: { role: "user" | "assistant"; content: unknown }[] = [
    {
      role: "user",
      content: `Today is ${opts.today}.\n\nStaff task:\n${body}`,
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // `auto` tool choice (the default) — portable to every current model.
    // The whole assistant turn is appended back unchanged below, which is
    // what the newest models' thinking blocks require.
    const posted = await postMessages({
      model: opts.model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });
    if (!posted.ok) {
      if (posted.reason === "no_key") return { ok: false, reason: "no_key" };
      return { ok: false, reason: "api_error", detail: posted.detail ?? posted.reason };
    }
    const json = posted.json as { content?: AnthropicBlock[]; stop_reason?: string };

    const content = Array.isArray(json.content) ? json.content : [];
    const toolUses = content.filter(
      (b): b is { type: "tool_use"; id: string; name: string; input: unknown } =>
        b.type === "tool_use",
    );

    // Finished? The plan tool is the terminal move.
    const planCall = toolUses.find((b) => b.name === "propose_plan");
    if (planCall) {
      return { ok: true, plan: parseCommandPlan(planCall.input) };
    }

    if (toolUses.length === 0) {
      // Model produced only text without proposing — nudge once, else give up.
      if (i === MAX_ITERATIONS - 1) return { ok: false, reason: "no_plan" };
      messages.push({ role: "assistant", content });
      messages.push({
        role: "user",
        content: "Call propose_plan now with the plan you have.",
      });
      continue;
    }

    // Execute every resolver call this turn, then feed the results back.
    messages.push({ role: "assistant", content });
    const toolResults = [];
    for (const call of toolUses) {
      const result = RESOLVER_NAMES.has(call.name)
        ? await executeResolver(
            supabase,
            call.name,
            (call.input ?? {}) as Record<string, unknown>,
          )
        : { error: `unknown tool: ${call.name}` };
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { ok: false, reason: "no_plan" };
}
