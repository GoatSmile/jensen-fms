/**
 * The ASSISTANT — the "secretary" behind the Dictate / floating button (owner,
 * 2026-10-01): one agent that ANSWERS ("what is my next appointment?"), OPENS
 * ("show me bike 55") and DRAFTS (a visit, a delivery, a ticket, an offer), in
 * one loop, deciding for itself which — no intent classifier (Munr's
 * Secretary, `munr/src/lib/agent/recall.ts`, which this follows).
 *
 * What it may do follows the person, not the app:
 * - it is OFFERED only the read tools their role allows (tools.ts), plus the
 *   drafting lookups when they may draft anything;
 * - it may only open, offer as a choice, or act on a record its own lookups
 *   returned in this run (`seen` — Munr's `mayTouch`), so an id can never be
 *   invented;
 * - a drafted action the person may not apply is dropped before it is shown.
 *
 * It never writes. Drafts come back as a CommandPlan the person applies with
 * one tap (owner, 2026-10-01), through the same apply path as a call's
 * suggestions. Every Anthropic call goes through the one door.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { postMessages } from "@/lib/anthropic/messages";
import { PLAN_ACTION_ITEM_SCHEMA } from "@/lib/inbound/command/agent";
import { parseCommandPlan, type CommandAction, type CommandPlan } from "@/lib/inbound/command/plan";
import { RESOLVER_NAMES, RESOLVER_TOOLS, executeResolver } from "@/lib/inbound/command/resolvers";

import { danishDaysAhead } from "@/lib/calls/days";
import { routeAllows } from "@/lib/people/routes";

import { TARGET_KINDS, parseAssistantAnswer, targetHref, type AssistantAnswer, type TargetKind } from "./answer";
import { toolsFor, type ToolContext } from "./tools";

const MAX_TOKENS = 8000;
// A database question may need a schema look and a retry after an error.
const MAX_ITERATIONS = 12;

/** Which right lets a person apply each kind of draft — the apply step checks it again. */
export const ACTION_CAPABILITIES: Record<CommandAction["type"], readonly string[]> = {
  draft_customer: ["customers"],
  draft_offer: ["so"],
  draft_sales_order: ["so"],
  draft_purchase_order: ["po"],
  draft_ticket: ["maintenance", "work"],
  draft_event: ["maintenance", "work"],
  // Notes (plan-inbox-notes.md): linking a note to a record is part of reading
  // one's inbox; changing a customer's contact details is customer data.
  attach_note: ["inbox", "calls_own"],
  save_contact: ["customers"],
  // Moving or deleting an appointment is calendar work, like making one.
  move_event: ["maintenance", "work"],
  delete_event: ["maintenance", "work"],
  // A note said to the secretary lands in the asker's own Inbox.
  save_note: ["inbox", "calls_own"],
};

export function mayApply(type: CommandAction["type"], caps: readonly string[]): boolean {
  return ACTION_CAPABILITIES[type].some((c) => caps.includes(c));
}

/**
 * *Act right away* (plan-inbox-notes.md, slice 4): which suggestions on a NOTE
 * may run with no press, for a person who has it switched on — and only when
 * nothing is uncertain. The owner's list (2026-10-08): putting a note on a
 * bike identified with certainty, and calendar changes. A resolver filled the
 * id only on exactly one match, so an id here IS the certainty. Contact
 * details, money and anything else always wait for a person. Re-checked at
 * apply time; a kind not listed here is never automatic.
 */
export function autoApplySafe(action: CommandAction): boolean {
  switch (action.type) {
    case "attach_note":
      return Boolean(action.bikeId);
    case "draft_event":
      return action.kind === "visit" && Boolean(action.organizationId) && Boolean(action.date);
    case "move_event":
      return Boolean(action.eventId) && Boolean(action.date);
    // The asker's own note, which they asked for in words.
    case "save_note":
      return true;
    // NOT delete_event, although the owner listed it as safe: on 8 Oct the
    // test note "cancel the TEST visit on Friday" resolved Friday to the
    // wrong week and found exactly one entry there — a real one. A wrong move
    // can be moved back; a wrong deletion is gone. Deleting waits for a
    // person, who sees which entry on the card.
    default:
      return false;
  }
}

/** How the prompt names each kind `autoApplySafe` carries out, for a person with it on. */
const AUTO_APPLY_WORDS: { type: CommandAction["type"]; words: string }[] = [
  { type: "draft_event", words: "booking a visit with a known customer and a date" },
  { type: "move_event", words: "moving an appointment found exactly" },
  { type: "save_note", words: "saving a note" },
];

export type AssistantResult =
  | { ok: true; answer: AssistantAnswer; plan: CommandPlan }
  | { ok: false; reason: "no_body" | "no_key" | "api_error" | "no_answer"; detail?: string };

/**
 * The call planner's drafts plus the calendar changes (owner, 2026-10-21: the
 * assistant moves, changes and makes appointments) — the same move_event /
 * delete_event shapes a note proposes, applied by the same core.
 */
const ASSISTANT_ACTION_ITEM_SCHEMA = {
  ...PLAN_ACTION_ITEM_SCHEMA,
  properties: {
    ...PLAN_ACTION_ITEM_SCHEMA.properties,
    type: {
      type: "string",
      enum: [...PLAN_ACTION_ITEM_SCHEMA.properties.type.enum, "move_event", "delete_event", "save_note"],
    },
    noteText: {
      type: ["string", "null"],
      description: "save_note: what to keep, in the person's own words, cleaned of 'make a note' itself.",
    },
    eventId: {
      type: ["string", "null"],
      description: "move_event / delete_event: the entry from find_calendar_entry (exactly one match), else do not propose it.",
    },
    eventLabel: {
      type: ["string", "null"],
      description: "move_event / delete_event: the entry as found — title and its current day and time.",
    },
  },
} as const;

/**
 * The tool list one assistant request sends — the ONE place it is put
 * together, used by every run and by the model Test. A drafting lookup whose
 * name a read tool already has is dropped (the read tool runs; it is checked
 * first): `find_bike` arrived in both on 2026-10-08, the API refuses duplicate
 * names, and every question from a person allowed to draft failed until
 * 2026-10-21 — while the Test, which listed the tools by hand, never ran.
 */
export function assistantToolDefs(readTools: { def: { name: string } }[], withResolvers: boolean): unknown[] {
  const reads = readTools.map((t) => t.def);
  const taken = new Set(reads.map((d) => d.name));
  const resolvers = withResolvers ? RESOLVER_TOOLS.filter((t) => !taken.has(t.name)) : [];
  return [...reads, ...resolvers, RESPOND_TOOL];
}

/** Exported for the model Test, which runs this exact shape (models.ts). */
export const RESPOND_TOOL = {
  name: "respond",
  description:
    "Give your answer. Call exactly once, after looking up what you need. `open` and `choices` may only use ids your lookups returned in this conversation.",
  input_schema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The reply: short, plain sentences (no markdown), in the person's language. Say what you found or did not find.",
      },
      open: {
        type: ["object", "null"],
        description: "The ONE record to show when the person asked to see/open something and exactly one matched. Else null.",
        properties: {
          kind: { type: "string", enum: [...TARGET_KINDS] },
          id: { type: "string" },
          label: { type: "string" },
        },
        required: ["kind", "id", "label"],
      },
      go: {
        type: "boolean",
        description: "true ONLY when the person asked to SEE/OPEN/SHOW a record and `open` is it — the app then goes straight to its page. false for a question (the answer must be read).",
      },
      choices: {
        type: "array",
        description: "When SEVERAL records match and the person must pick: up to 8, best first. Else empty.",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...TARGET_KINDS] },
            id: { type: "string" },
            label: { type: "string", description: "What tells them apart (code, frame, owner)." },
          },
          required: ["kind", "id", "label"],
        },
      },
      actions: {
        type: "array",
        description: "DRAFT actions to propose, only when the person asked for something to be created. Empty for a question.",
        items: ASSISTANT_ACTION_ITEM_SCHEMA,
      },
    },
    required: ["text", "go", "choices", "actions"],
  },
} as const;

/** The kinds of record whose page this person's role may open — middleware's rule. */
function openableKinds(caps: readonly string[]): TargetKind[] {
  return TARGET_KINDS.filter((k) => routeAllows(targetHref({ kind: k, id: "x" }), caps));
}

function systemPrompt(opts: {
  language: "da" | "en";
  drafts: string[];
  openable: TargetKind[];
  now: string;
  autoApply: string[];
}): string {
  return `You are the assistant inside Jensen FMS, the system of a Danish workshop that builds and repairs custom-branded bikes (Jensen Production / Logocykler). A staff member speaks or types to you — like to a secretary. You can ANSWER questions, OPEN a record for them, and DRAFT actions for them to confirm. You never change anything yourself.

Now: ${opts.now} (Copenhagen).
The next two weeks: ${danishDaysAhead()}. For "Friday", "next Tuesday", "tomorrow" — LOOK THE DATE UP in this list; never work it out.

How to work:
0. A GENERAL question that is not about the shop's records — today's date, the time, the weekday, the week number, a simple sum, a word's meaning — answer it directly from the line above or plain knowledge, without tools.
1. LOOK BEFORE YOU ANSWER. Use the tools to find what was asked about. Never answer from memory, never invent a bike, customer, number, date or amount.
   THE INBOX COMES FIRST: for anything about what is new, waiting, who called, what someone said or asked for, look in \`inbox\` before anything else — it holds the calls and the spoken notes, and most questions start there. A call or a note opens as kind "call".
2. "Show me / open / find X": look it up; if exactly ONE matches, set \`open\` to it and \`go\` true. If several match, list them in \`choices\` (best first) and say how many matched. If none, say so.
3. A question ("what is my next appointment?", "how many X do we have?", "what's the status of SO 12?"): answer in one or two short sentences from what the tools returned, with \`go\` false. Set \`open\` too when one record is clearly the subject, so they can open it.
4. A request to CREATE something: propose it in \`actions\` as drafts — the person confirms each with one tap. You may draft only these: ${opts.drafts.length ? opts.drafts.join(", ") : "nothing (this person may not create anything here — say so)"}.
   - A visit or a delivery is a draft_event (eventKind "visit" or "delivery"); resolve the date against today; a time only if one was said. Its customer goes through search_customer. There are no reminders — if asked for one, say the calendar takes visits and deliveries only.
   - Never put a phone number or a person's name in a calendar title.
   - To MOVE an appointment already in the calendar, or CHANGE its day or time: find it with find_calendar_entry (words from its title, and its current day if said), then draft move_event with the NEW date (and time only if said). To CANCEL one: delete_event. Propose either only when find_calendar_entry returned exactly ONE entry; otherwise list what matched and ask which. Only the day and time can change — not the title or the customer; if asked to, say so and offer to cancel it and make a new one.
   - "What is in the calendar / my next appointment" is a question: read it with calendar_entries.
   - A NOTE only when they ask for one ("make a note", "note that", "remember that", "noter", "skriv ned"): save_note with the words to keep. A question or an instruction is never a note.
   - ${opts.autoApply.length ? `For THIS person these are carried out AT ONCE when you propose them, with no tap: ${opts.autoApply.join("; ")}. Word those as DONE, in past tense ("Moved the Gladsaxe visit to Monday 13:00"). Everything else waits for a tap — word it as a proposal ("Tap Delete to cancel it").` : `Nothing happens until the person taps the draft. So word the reply as a PROPOSAL ("Tap Move to move it to Monday 13:00"), never as done ("I am moving it").`}
   - Fill an id only when a lookup returned exactly one match; otherwise leave it null.
5. Only use ids your tools returned in this conversation. If a tool says you are not allowed, tell the person plainly.
   This person can open pages for: ${opts.openable.join(", ")}. For any other kind, do not set \`open\` — say plainly that you can't open it for them (you may still say what you found).
6. Amounts of money appear only if a tool returned them; never estimate one. If they ask about a price and no tool returned one, say that prices are not shown to them — not that there is no price.
7. Reply in ${opts.language === "da" ? "Danish" : "English"}, plainly, without markdown. Keep it short — this is read on a phone.

Finish by calling \`respond\` exactly once.`;
}

type Block = { type: string; id?: string; name?: string; input?: unknown; [k: string]: unknown };

/** Copenhagen "2026-10-01 14:05, Thursday" — so "this Friday" and "next" resolve right. */
function danishNow(): string {
  const d = new Date();
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit" }).format(d);
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", weekday: "long" }).format(d);
  return `${date} ${time}, ${weekday}`;
}

export async function runAssistant(
  supabase: SupabaseClient,
  request: string,
  opts: {
    model: string;
    caps: readonly string[];
    canSeeCosts: boolean;
    language: "da" | "en";
    /** Who is asking — scopes the inbox. */
    personId: string | null;
    /** The asker has *act right away* on: safe drafts will be carried out at once. */
    autoApply?: boolean;
    /** One earlier exchange (≤10 min), so "and the one after?" makes sense. */
    prior?: { request: string; answer: string } | null;
  },
): Promise<AssistantResult> {
  const body = request.trim();
  if (!body) return { ok: false, reason: "no_body" };

  const ctx: ToolContext = {
    supabase,
    caps: opts.caps,
    canSeeCosts: opts.canSeeCosts,
    personId: opts.personId,
    seen: new Map(),
  };
  const readTools = toolsFor(opts.caps);
  const drafts = (Object.keys(ACTION_CAPABILITIES) as CommandAction["type"][]).filter((t) => mayApply(t, opts.caps));
  // The drafting lookups come only with a right to draft.
  const tools = assistantToolDefs(readTools, drafts.length > 0);
  const readByName = new Map(readTools.map((t) => [t.def.name, t]));

  const messages: { role: "user" | "assistant"; content: unknown }[] = [];
  if (opts.prior) {
    messages.push({ role: "user", content: opts.prior.request });
    messages.push({ role: "assistant", content: opts.prior.answer || "(no answer)" });
  }
  messages.push({ role: "user", content: body });

  const openable = openableKinds(opts.caps);
  const system = systemPrompt({
    language: opts.language,
    drafts,
    openable,
    now: danishNow(),
    autoApply: opts.autoApply ? AUTO_APPLY_WORDS.filter((w) => drafts.includes(w.type)).map((w) => w.words) : [],
  });

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const posted = await postMessages({ model: opts.model, max_tokens: MAX_TOKENS, system, tools, messages });
    if (!posted.ok) {
      if (posted.reason === "no_key") return { ok: false, reason: "no_key" };
      return { ok: false, reason: "api_error", detail: posted.detail ?? posted.reason };
    }
    const content = ((posted.json as { content?: Block[] }).content ?? []) as Block[];
    const uses = content.filter((b) => b.type === "tool_use");

    const done = uses.find((b) => b.name === "respond");
    if (done) return finish(done.input, ctx, opts.caps, openable);

    if (uses.length === 0) {
      if (i === MAX_ITERATIONS - 1) return { ok: false, reason: "no_answer" };
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: "Call respond now with your answer." });
      continue;
    }

    messages.push({ role: "assistant", content });
    const results = [];
    for (const call of uses) {
      const input = (call.input ?? {}) as Record<string, unknown>;
      let result: unknown;
      const read = readByName.get(call.name ?? "");
      if (read) {
        result = await read.run(ctx, input);
      } else if (drafts.length && RESOLVER_NAMES.has(call.name ?? "")) {
        result = await executeResolver(supabase, call.name ?? "", input);
        // Customers found while drafting may also be opened or offered — a
        // close spelling only as a CHOICE the person taps, which `respond` allows.
        if (call.name === "search_customer") {
          const r = result as { matches?: { id: string }[]; close?: { id: string }[] };
          for (const m of [...(r.matches ?? []), ...(r.close ?? [])]) ctx.seen.set(m.id, "customer");
        }
      } else {
        result = { error: `not available to this person: ${call.name}` };
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: results });
  }
  return { ok: false, reason: "no_answer" };
}

/** The model's `respond` → an answer the app can trust: seen ids only, allowed drafts only. */
function finish(raw: unknown, ctx: ToolContext, caps: readonly string[], openable: TargetKind[]): AssistantResult {
  const parsed = parseAssistantAnswer(raw) ?? { text: "", open: null, go: false, choices: [] };
  // Seen in this run AND a page this person may open.
  const known = (t: { kind: TargetKind; id: string }) => ctx.seen.get(t.id) === t.kind && openable.includes(t.kind);
  const open = parsed.open && known(parsed.open) ? parsed.open : null;
  const answer: AssistantAnswer = {
    text: parsed.text,
    open,
    go: open !== null && parsed.go,
    choices: parsed.choices.filter(known),
  };
  // A model that puts ONE action's fields at the top of `respond` (Haiku did,
  // for a note, 2026-10-21) still means that action.
  const r = (raw ?? {}) as { actions?: unknown[]; type?: unknown };
  const actions = Array.isArray(r.actions) && r.actions.length ? r.actions : typeof r.type === "string" ? [r] : [];
  const plan = parseCommandPlan({ summary: "", notes: [], actions });
  plan.actions = plan.actions.filter((a) => mayApply(a.type, caps));
  return { ok: true, answer, plan };
}
