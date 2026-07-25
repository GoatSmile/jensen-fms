/**
 * Inbound extraction stage (Slice C) — turns the normalized `body_text`
 * (transcript / email body / message text) into the structured
 * InboundExtraction the matcher (Slice D) consumes. Channel-blind: it reads
 * ONLY `body_text`, never the channel payload.
 *
 * Provider-dispatched per the inbound registry (settings.ts →
 * EXTRACTION_PROVIDERS). The `anthropic` adapter is a thin fetch wrapper to
 * the Messages API with forced tool-use shaped to the extraction schema — no
 * SDK dependency, same house pattern as src/lib/email/send.ts and
 * src/lib/economic/client.ts. The API key is a SECRET (env `ANTHROPIC_API_KEY`,
 * config doctrine tier 1); the provider selection + model live in app_settings.
 *
 * The model's tool input is always run through parseExtraction(), so a
 * malformed or partial response degrades to nulls rather than throwing — the
 * matcher then simply finds fewer candidates.
 *
 * Server-only (reads process.env). Import from server actions.
 */
import { parseExtraction, type InboundExtraction } from "./extraction";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1024;

/**
 * Typed failure reasons so the caller (a server action) can map each to a
 * localized message instead of surfacing a raw English string.
 */
export type ExtractResult =
  | { ok: true; extraction: InboundExtraction }
  | {
      ok: false;
      reason: "no_body" | "no_key" | "unknown_provider" | "api_error";
      detail?: string;
    };

export async function extractInbound(
  bodyText: string | null,
  opts: {
    provider: string;
    model: string;
    /**
     * True when body_text is a two-way CONVERSATION transcript (a live bridged
     * call) rather than a one-way message — see
     * docs/plan-live-call-recording.md. Switches the system prompt so the
     * customer's request and OUR promises don't get conflated.
     */
    dialogue?: boolean;
    /** True when the transcript's speaker labels are a diarization guess. */
    speakersInferred?: boolean;
  },
): Promise<ExtractResult> {
  const body = (bodyText ?? "").trim();
  if (!body) return { ok: false, reason: "no_body" };
  if (opts.provider === "anthropic") {
    return extractViaAnthropic(body, opts.model, {
      dialogue: opts.dialogue === true,
      speakersInferred: opts.speakersInferred === true,
    });
  }
  return { ok: false, reason: "unknown_provider", detail: opts.provider };
}

const SYSTEM_PROMPT = `You extract structured facts from a message left for a Danish workshop that builds and repairs custom-branded bikes (Jensen Production / Logocykler). The customers are hotels, municipalities, hospitals, facility-management firms and similar organizations; they get in touch about repairs, orders, and questions.

Extract only what the message actually states — never invent or guess. Leave a field null when the message does not clearly state it. Record the message's own language as "da" or "en". Classify intent as repair_request, order_inquiry, or other. Set urgency to low, normal, or high based on how the message frames it. Set confidence to how well you could make sense of the message overall — low when the text is garbled, fragmentary, or ambiguous, high when it is clear and complete. Call the record_understanding tool exactly once with your result.

Leave callSummary null and commitments empty — this is a one-way message, not a conversation.`;

/**
 * Dialogue variant — a live bridged CALL. The transcript has two speakers, and
 * the whole risk is conflating "the customer asked for X" with "we promised X".
 * Speaker labels may be a diarization guess, so the prompt teaches the model to
 * work out the sides from context (the workshop answers the phone) and to fall
 * back to null rather than pick wrong.
 */
function dialogueSystemPrompt(speakersInferred: boolean): string {
  return `You are reading a TRANSCRIPT OF A RECORDED PHONE CONVERSATION between a Danish workshop that builds and repairs custom-branded bikes (Jensen Production / Logocykler) and a customer. The customers are hotels, municipalities, hospitals, facility-management firms and similar organizations.

${
    speakersInferred
      ? 'The two sides are labelled "Speaker 1" and "Speaker 2". These labels were GUESSED by speaker-separation software and MAY BE SWAPPED. Work out which side is the workshop from context — the workshop answers the phone, greets with the company name, quotes prices and promises dates; the customer describes a problem or places an order. If you genuinely cannot tell which side is which, leave the person/organization fields null rather than guessing wrong.'
      : 'Turns are labelled "Customer" and "Workshop". These labels are RELIABLE — they come from separate audio channels (the telephony system records each party on its own channel), not from guesswork. Trust them. Note that background noise on one side (a radio, another person in the room) is attributed to that side\'s label, so ignore anything that clearly is not part of the conversation.'
  }

Extract facts about the CUSTOMER and their request — never attribute the workshop's own words to the customer. Rules:
- callerName / organizationName / callbackNumber / frameNumber / qrCode / fleetNumber / colorHint / bikeTypeHint: about the CUSTOMER and their bike only.
- problem: what the customer needs, in one short line.
- intent: repair_request, order_inquiry, or other.
- urgency: low, normal or high, based on how the customer frames it.
- language: the conversation's language, "da" or "en".
- confidence: how well you could follow the conversation overall — low when the transcript is garbled or the speakers are unclear, high when it is clean.
- callSummary: 2-3 sentences — what the call was about and how it ended.
- commitments: the things THE WORKSHOP promised (e.g. "delivery Tuesday", "will send a quote", "2500 kr"). Only real, stated promises; an empty list if none. This is the part that hurts if it is forgotten, so be precise and do not pad it.

Extract only what was actually said. Call the record_understanding tool exactly once.`;
}

// Non-strict tool schema: nullable everywhere, every field required so the
// model returns each key (null when unknown). parseExtraction() is the real
// contract enforcer — this just shapes the call.
const EXTRACTION_TOOL = {
  name: "record_understanding",
  description:
    "Record the structured facts extracted from the inbound message. Pass null for anything the message does not clearly state.",
  input_schema: {
    type: "object",
    properties: {
      callerName: {
        type: ["string", "null"],
        description: "Name of the person who left the message.",
      },
      organizationName: {
        type: ["string", "null"],
        description: "The customer organization named, if any.",
      },
      callbackNumber: {
        type: ["string", "null"],
        description: "A phone number to call back on, if stated.",
      },
      frameNumber: {
        type: ["string", "null"],
        description:
          "A bike frame number, if stated. Just the identifier itself, no surrounding words.",
      },
      qrCode: {
        type: ["string", "null"],
        description:
          "A QR code value, if stated. Just the code itself, no surrounding words.",
      },
      fleetNumber: {
        type: ["string", "null"],
        description:
          "The customer's own bike number — JUST the bare number or code (e.g. from 'cykel nummer 42' or 'bike 25', extract '42' / '25'), never the surrounding words.",
      },
      colorHint: {
        type: ["string", "null"],
        description: "A colour clue about the bike ('the red one').",
      },
      bikeTypeHint: {
        type: ["string", "null"],
        description: "A bike-type clue ('the cargo bike').",
      },
      problem: {
        type: ["string", "null"],
        description: "A short description of the problem or request.",
      },
      urgency: {
        type: ["string", "null"],
        enum: ["low", "normal", "high", null],
        description: "How urgent the message sounds.",
      },
      language: {
        type: ["string", "null"],
        description: "The message's language: 'da' or 'en'.",
      },
      intent: {
        type: ["string", "null"],
        enum: ["repair_request", "order_inquiry", "other", null],
        description: "The caller's intent.",
      },
      confidence: {
        type: ["string", "null"],
        enum: ["low", "medium", "high", null],
        description:
          "How well you could make sense of the message overall (low = garbled/ambiguous, high = clear).",
      },
      callSummary: {
        type: ["string", "null"],
        description:
          "CONVERSATIONS ONLY: 2-3 sentences on what the call was about and how it ended. Null for a one-way message.",
      },
      commitments: {
        type: ["array", "null"],
        items: { type: "string" },
        description:
          "CONVERSATIONS ONLY: what the WORKSHOP promised the customer (dates, prices, next steps). Empty for a one-way message.",
      },
    },
    required: [
      "callerName",
      "organizationName",
      "callbackNumber",
      "frameNumber",
      "qrCode",
      "fleetNumber",
      "colorHint",
      "bikeTypeHint",
      "problem",
      "urgency",
      "language",
      "intent",
      "confidence",
      "callSummary",
      "commitments",
    ],
  },
} as const;

async function extractViaAnthropic(
  body: string,
  model: string,
  shape: { dialogue: boolean; speakersInferred: boolean },
): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };
  const system = shape.dialogue
    ? dialogueSystemPrompt(shape.speakersInferred)
    : SYSTEM_PROMPT;

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
        messages: [{ role: "user", content: body }],
      }),
    });
  } catch (e) {
    return {
      ok: false,
      reason: "api_error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: "api_error", detail: `${res.status} ${text}`.trim() };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: "api_error", detail: "invalid JSON response" };
  }

  const toolInput = findToolInput(json, EXTRACTION_TOOL.name);
  if (toolInput === null) {
    return { ok: false, reason: "api_error", detail: "no tool_use in response" };
  }
  return { ok: true, extraction: parseExtraction(toolInput) };
}

/** Pull the forced-tool `input` object out of the Messages API content array. */
function findToolInput(json: unknown, name: string): unknown {
  const content = (json as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "tool_use" &&
      (block as { name?: unknown }).name === name
    ) {
      return (block as { input?: unknown }).input ?? {};
    }
  }
  return null;
}
