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
  opts: { provider: string; model: string },
): Promise<ExtractResult> {
  const body = (bodyText ?? "").trim();
  if (!body) return { ok: false, reason: "no_body" };
  if (opts.provider === "anthropic") {
    return extractViaAnthropic(body, opts.model);
  }
  return { ok: false, reason: "unknown_provider", detail: opts.provider };
}

const SYSTEM_PROMPT = `You extract structured facts from a message left for a Danish workshop that builds and repairs custom-branded bikes (Jensen Production / Logocykler). The customers are hotels, municipalities, hospitals, facility-management firms and similar organizations; they get in touch about repairs, orders, and questions.

Extract only what the message actually states — never invent or guess. Leave a field null when the message does not clearly state it. Record the message's own language as "da" or "en". Classify intent as repair_request, order_inquiry, or other. Set urgency to low, normal, or high based on how the message frames it. Call the record_understanding tool exactly once with your result.`;

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
    ],
  },
} as const;

async function extractViaAnthropic(
  body: string,
  model: string,
): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };

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
        system: SYSTEM_PROMPT,
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
