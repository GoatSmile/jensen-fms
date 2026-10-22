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
import { toolsFor, withDatabaseSchema, type ToolContext } from "./tools";

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
    // A visit or a delivery with a day — the owner's "schedule" (2026-10-08).
    // Deliveries joined 2026-10-21 (Finn was told "done" for one that waited),
    // and so did entries for a customer the app does not know: "the calendar
    // event does not need to correspond to an existing customer … if not
    // able, then just add whatever has been dictated" (owner, same day).
    case "draft_event":
      return Boolean(action.date) && Boolean(action.title);
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
  { type: "draft_event", words: "booking a visit or a delivery on a date" },
  { type: "move_event", words: "moving an appointment found exactly" },
  { type: "save_note", words: "saving a note" },
];

/** The kinds that can run with no press — anything else always waits. */
export const AUTO_APPLY_KINDS: ReadonlySet<CommandAction["type"]> = new Set(AUTO_APPLY_WORDS.map((w) => w.type));

/** One earlier turn of the conversation, as the next request carries it. */
export type ConversationTurn = { request: string; answer: string; done: string[]; lookups: string[] };

export type AssistantResult =
  | { ok: true; answer: AssistantAnswer; plan: CommandPlan; lookups: string[]; timings: AssistantTimings }
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

/**
 * The part of the system prompt that is the SAME for every request of this
 * person in this mode — cached with the tools (`assistantRequest`). Anything
 * that changes per request (the clock, the language, the page) goes in
 * `requestContext`, AFTER the cache breakpoint: one changed byte here would
 * re-send all of it uncached.
 */
function systemPrompt(opts: {
  drafts: string[];
  openable: TargetKind[];
  autoApply: string[];
  spoken: boolean;
}): string {
  return `You are the assistant inside Jensen FMS, the system of a Danish workshop that builds and repairs custom-branded bikes (Jensen Production / Logocykler). A staff member speaks or types to you — like to a secretary. You can ANSWER questions, OPEN a record for them, and DRAFT actions for them to confirm. You never change anything yourself.

The date, the time, the coming fortnight, the reply language and the page the person has open are given under "This request" below.

How to work:
0. A GENERAL question that is not about the shop's records — today's date, the time, the weekday, the week number, a simple sum, a word's meaning — answer it directly from "This request" or plain knowledge, without tools.
   ${opts.spoken ? `The request is TRANSCRIBED SPEECH and may hold words that were not meant for you — a remark to someone in the room, a comment about the app. If nothing in it is a question or a request for you, reply only "Was that for me?" (in the reply language), with no lookups and no actions. If part of it is for you, answer that part and ignore the rest.` : `Answer what was asked; ignore words that are clearly not meant for you.`}
1. LOOK BEFORE YOU ANSWER. Use the tools to find what was asked about. Never answer from memory, never invent a bike, customer, number, date or amount.
   THE INBOX COMES FIRST: for anything about what is new, waiting, who called, what someone said or asked for, look in \`inbox\` before anything else — it holds the calls and the spoken notes, and most questions start there. A call or a note opens as kind "call".
   NOT FOUND IS NOT "DOES NOT EXIST". Your tools see only part of the system. When a lookup finds nothing, say where you looked ("I found no call or note mentioning Benny"). Never say that something does not exist, or that the system has no such thing, unless a tool made for exactly that came back empty. When no tool covers what they ask about, say you cannot see that yet — never guess.
   "Last", "latest" and "most recent" mean the PAST; "next" and "coming" mean the future.
   THE PAGE: when "This request" names the record the person has open, "this", "here" and "it" (with nothing earlier in the conversation to point at) mean that record.
2. "Show me / open / find X": look it up; if exactly ONE matches, set \`open\` to it and \`go\` true. If several match, list them in \`choices\` (best first) and say how many matched. If none, say so.
3. A question ("what is my next appointment?", "how many X do we have?", "what's the status of SO 12?"): answer in one or two short sentences from what the tools returned, with \`go\` false. Set \`open\` too when one record is clearly the subject, so they can open it.
4. A request to CREATE something: propose it in \`actions\` as drafts — the person confirms each with one tap. You may draft only these: ${opts.drafts.length ? opts.drafts.join(", ") : "nothing (this person may not create anything here — say so)"}.
   - A visit or a delivery is a draft_event (eventKind "visit" or "delivery"); resolve the date against today; a time only if one was said. Look the customer up with search_customer and link it when exactly one matches; bikes it is about (a code, a frame number) go in \`bikes\` from find_bike when exactly one matches each — both are linked in the entry; when nothing (or nothing certain) matches, STILL book it — organizationId null, the name exactly as said in the title. A calendar entry never needs a customer in the system; do not ask which customer first. There are no reminders — if asked for one, say the calendar takes visits and deliveries only.
   - Never put a phone number or a person's name in a calendar title.
   - To MOVE an appointment already in the calendar, or CHANGE its day or time: find it with find_calendar_entry (words from its title, and its current day if said), then draft move_event with the NEW date (and time only if said). To CANCEL one: delete_event. Propose either only when find_calendar_entry returned exactly ONE entry; otherwise list what matched and ask which. Only the day and time can change — not the title or the customer; if asked to, say so and offer to cancel it and make a new one.
   - THIS IS A CONVERSATION. "It", "that", "the appointment", "the second one", "move it" mean what the conversation so far was about — take the record (an entry's eventId, a bike, a customer) from the earlier turns and their lookups, and act on it; look up again only when it is truly unclear. An entry from calendar_entries earlier in the conversation may be moved or cancelled by its eventId directly.
   - THE calendar is the shop's SERVICE CALENDAR (Servicebesøg) — the one Google calendar the app is connected to, which Finn and the office share. Every entry you read, book, move or cancel is there; there is no other calendar, personal or otherwise. "My calendar" means this one.
   - "What is in the calendar / my next appointment" is a question: read it with calendar_entries.
   - An offer to act ("say yes and I'll book it") MUST come with the draft in \`actions\` now — a yes can only confirm what you drafted. If the customer is uncertain, draft it with the customer you found and ask.
   - A NOTE only when they ask for one ("make a note", "note that", "remember that", "noter", "skriv ned"): save_note with the words to keep. A question or an instruction is never a note.
   - ${opts.autoApply.length ? `For THIS person these are carried out AT ONCE when you propose them, with no tap: ${opts.autoApply.join("; ")}. Word those as DONE, in past tense ("Moved the Gladsaxe visit to Monday 13:00"). Everything else waits for the person — ${opts.spoken ? `ask for a spoken yes ("Shall I cancel the Gladsaxe visit on Monday 13:00? Say yes.")` : `word it as a proposal ("Tap Delete to cancel it")`}.` : opts.spoken ? `Nothing happens until the person says yes. So ASK ("Shall I move it to Monday 13:00? Say yes."), never say it is done.` : `Nothing happens until the person taps the draft. So word the reply as a PROPOSAL ("Tap Move to move it to Monday 13:00"), never as done ("I am moving it").`}
   - Fill an id only when a lookup returned exactly one match; otherwise leave it null.
5. Only use ids your tools returned in this conversation. If a tool says you are not allowed, tell the person plainly.
   This person can open pages for: ${opts.openable.join(", ")}. For any other kind, do not set \`open\` — say plainly that you can't open it for them (you may still say what you found).
6. Amounts of money appear only if a tool returned them; never estimate one. If they ask about a price and no tool returned one, say that prices are not shown to them — not that there is no price.
7. Reply in the language "This request" names, plainly, without markdown. Keep it short — this is read on a phone.${opts.spoken ? `
   The reply is READ ALOUD. Do not read out frame numbers, serial numbers, RAL codes or long ids — a voice garbles them. Say what a person would: "bike 35", the colour's name, the customer, the model. Give a number only when they asked for that number.` : ""}

Finish by calling \`respond\` exactly once.`;
}

/** The record the person has open, as `describePage` (page.ts) resolved it. */
export type PageContext = { kind: TargetKind; id: string; label: string };

/** What changes per request — sent after the cache breakpoint. */
function requestContext(opts: { language: "da" | "en"; now: string; page: PageContext | null }): string {
  return `This request:
- Now: ${opts.now} (Copenhagen).
- The next two weeks: ${danishDaysAhead()}. For "Friday", "next Tuesday", "tomorrow" — LOOK THE DATE UP in this list; never work it out.
- Reply in ${opts.language === "da" ? "Danish" : "English"}.
- ${opts.page ? `The person has this record open: ${opts.page.kind} "${opts.page.label}" (id ${opts.page.id}).` : "No particular record is open."}`;
}

/**
 * The request body of one assistant turn — the ONE shape, for every run and
 * for the model Test, so the Test exercises what production sends. Cached in
 * two places (prompt caching is accepted by every current model): an explicit
 * breakpoint after the stable system prompt, so tools + rules are read from
 * the cache on every call of a turn and across turns, and the top-level
 * automatic breakpoint, which moves with the growing tool loop.
 */
export function assistantRequest(args: {
  model: string;
  stableSystem: string;
  requestSystem: string;
  tools: unknown[];
  messages: unknown[];
  maxTokens?: number;
}): Record<string, unknown> {
  return {
    model: args.model,
    max_tokens: args.maxTokens ?? MAX_TOKENS,
    cache_control: { type: "ephemeral" },
    system: [
      { type: "text", text: args.stableSystem, cache_control: { type: "ephemeral" } },
      { type: "text", text: args.requestSystem },
    ],
    tools: args.tools,
    messages: args.messages,
  };
}

/** How long a turn took and where (stored on the answer, `assistant_answer.timings`). */
export type AssistantTimings = {
  totalMs: number;
  toolMs: number;
  calls: { ms: number; input: number; cacheRead: number; cacheWrite: number; output: number; tools: string[] }[];
};

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
    /** Asked by voice — nothing to tap; a waiting action asks for a spoken yes. */
    spoken?: boolean;
    /** The conversation so far, oldest first — so "it" and "that one" resolve. */
    history?: ConversationTurn[];
    /** The record the person has open (page.ts), so "this bike" resolves. */
    page?: PageContext | null;
  },
): Promise<AssistantResult> {
  const started = Date.now();
  const body = request.trim();
  if (!body) return { ok: false, reason: "no_body" };

  const ctx: ToolContext = {
    supabase,
    caps: opts.caps,
    canSeeCosts: opts.canSeeCosts,
    personId: opts.personId,
    seen: new Map(),
  };
  // The open record may be opened or acted on like one a lookup returned.
  if (opts.page) ctx.seen.set(opts.page.id, opts.page.kind);
  const readTools = toolsFor(opts.caps);
  const drafts = (Object.keys(ACTION_CAPABILITIES) as CommandAction["type"][]).filter((t) => mayApply(t, opts.caps));
  // The drafting lookups come only with a right to draft.
  const tools = await withDatabaseSchema(supabase, assistantToolDefs(readTools, drafts.length > 0));
  const readByName = new Map(readTools.map((t) => [t.def.name, t]));
  const timings: AssistantTimings = { totalMs: 0, toolMs: 0, calls: [] };

  const messages: { role: "user" | "assistant"; content: unknown }[] = [];
  /** This turn's lookups, kept with the answer for the next turn (ask.ts). */
  const lookups: string[] = [];
  for (const turn of opts.history ?? []) {
    messages.push({ role: "user", content: turn.request || "(nothing said)" });
    const done = turn.done.length
      ? `\n\n[Carried out in the system by that reply — already DONE, never do it again: ${turn.done.join("; ")}]`
      : "";
    const looked = turn.lookups.length
      ? `\n\n[What I looked up for that reply — the ids are valid now: ${turn.lookups.join(" | ")}]`
      : "";
    messages.push({ role: "assistant", content: `${turn.answer || "(no answer)"}${done}${looked}` });
  }
  messages.push({ role: "user", content: body });

  const openable = openableKinds(opts.caps);
  const stableSystem = systemPrompt({
    drafts,
    openable,
    spoken: opts.spoken === true,
    autoApply: opts.autoApply ? AUTO_APPLY_WORDS.filter((w) => drafts.includes(w.type)).map((w) => w.words) : [],
  });
  const requestSystem = requestContext({ language: opts.language, now: danishNow(), page: opts.page ?? null });

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const callStarted = Date.now();
    const posted = await postMessages(assistantRequest({ model: opts.model, stableSystem, requestSystem, tools, messages }));
    if (!posted.ok) {
      if (posted.reason === "no_key") return { ok: false, reason: "no_key" };
      return { ok: false, reason: "api_error", detail: posted.detail ?? posted.reason };
    }
    const content = ((posted.json as { content?: Block[] }).content ?? []) as Block[];
    const uses = content.filter((b) => b.type === "tool_use");
    const usage = ((posted.json as { usage?: Record<string, unknown> }).usage ?? {}) as Record<string, unknown>;
    const n = (k: string) => (typeof usage[k] === "number" ? (usage[k] as number) : 0);
    timings.calls.push({
      ms: Date.now() - callStarted,
      input: n("input_tokens"),
      cacheRead: n("cache_read_input_tokens"),
      cacheWrite: n("cache_creation_input_tokens"),
      output: n("output_tokens"),
      tools: uses.map((u) => u.name ?? "?"),
    });

    const done = uses.find((b) => b.name === "respond");
    if (done) {
      timings.totalMs = Date.now() - started;
      return { ...finish(done.input, ctx, opts.caps, openable), lookups: lookups.slice(-8), timings };
    }

    if (uses.length === 0) {
      if (i === MAX_ITERATIONS - 1) return { ok: false, reason: "no_answer" };
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: "Call respond now with your answer." });
      continue;
    }

    messages.push({ role: "assistant", content });
    // The lookups of one reply run TOGETHER (a calendar read and an inbox read
    // need not wait for each other); results go back in the model's order.
    const toolsStarted = Date.now();
    const ran = await Promise.all(
      uses.map(async (call) => {
        const input = (call.input ?? {}) as Record<string, unknown>;
        let result: unknown;
        const read = readByName.get(call.name ?? "");
        try {
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
        } catch (e) {
          // One failed lookup must not sink the others' answers.
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        return { call, input, result, logged: Boolean(read) || RESOLVER_NAMES.has(call.name ?? "") };
      }),
    );
    timings.toolMs += Date.now() - toolsStarted;
    const results = [];
    for (const { call, input, result, logged } of ran) {
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
      if (logged) {
        lookups.push(`${call.name}(${JSON.stringify(input).slice(0, 160)}) → ${JSON.stringify(result).slice(0, 1200)}`);
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { ok: false, reason: "no_answer" };
}

/** The model's `respond` → an answer the app can trust: seen ids only, allowed drafts only. */
function finish(
  raw: unknown,
  ctx: ToolContext,
  caps: readonly string[],
  openable: TargetKind[],
): { ok: true; answer: AssistantAnswer; plan: CommandPlan } {
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
