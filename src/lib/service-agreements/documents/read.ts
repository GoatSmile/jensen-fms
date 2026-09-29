/**
 * Read a signed service agreement — phone photos of the pages or a PDF — into
 * an `AgreementReading` PROPOSAL (migration 110). The model reads the pages
 * directly (image and PDF blocks); nothing is written from its reply until a
 * person confirms it on the review page.
 *
 * Provider-dispatched through the inbound extraction registry
 * (`src/lib/inbound/settings.ts` → EXTRACTION_PROVIDERS): the same provider,
 * model setting and key as the inbox, so there is no second place to configure
 * it. Thin fetch wrapper with a forced tool, the house pattern of
 * `src/lib/inbound/extract.ts`.
 *
 * Server-only (reads process.env).
 */
import "server-only";

import { parseAgreementReading, type AgreementReading } from "./reading";
import type { DocumentMime } from "./storage";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/** A fleet of 60 bikes is ~60 frame rows; leave room for them. */
const MAX_TOKENS = 8192;
/** Under the read route's maxDuration, so a slow reply fails cleanly. */
const TIMEOUT_MS = 55_000;

export type DocumentPage = { mime: DocumentMime; base64: string };

export type ReadDocumentResult =
  | { ok: true; reading: AgreementReading; raw: unknown }
  | {
      ok: false;
      reason: "no_pages" | "no_key" | "unknown_provider" | "api_error";
      detail?: string;
    };

const SYSTEM_PROMPT = `You read signed SERVICE AGREEMENTS (serviceaftaler) for a Danish workshop, Jensen Production / Logocykler, that builds and services custom-branded bikes for municipalities, hospitals, hotels and companies. You are given the pages of ONE agreement — phone photos or a PDF, usually in Danish, often a filled-in template with handwriting, stamps and signatures.

Jensen's two templates: "Kommuneservice" (municipalities; 10-year term) and "Virksomheder" (companies; 3 years fixed, extendable to 5, then yearly). Contract types are written K1, K3, K5 or K10 — the number of years the customer commits to. The agreement lists the covered bikes in a table (make, type, FRAME NUMBER / stelnummer).

Rules:
- Report only what the pages actually show. Never invent or complete a value; leave a field null when it is not clearly on the page.
- Frame numbers: copy EVERY frame number in the bike table exactly as printed or written, one entry each, in page order — letters and digits as they appear, including any prefix and trailing letter. If a character is unreadable, give your best reading and say which frame in remarks.
- The customer is the organization signing with Jensen; department is the unit (e.g. "Hjemmeplejen Nord") when one is named.
- contract_type: only when K1/K3/K5/K10 is written or ticked. term_years: the term in years as written (e.g. "10 år").
- signed_on: the date by the customer's signature, as YYYY-MM-DD. signatories: the names (and titles, if printed) of who signed, on both sides.
- Price: the price per bike as stated. price_period is the unit the price is QUOTED PER — "pr. måned" / "per month" is "month" even when the paper also says it is paid yearly ("betales årligt forud"); "pr. år" / "per year" is "year". If the paper gives stepped prices (year 1, years 2–5 …), report the FIRST one and describe the steps in remarks.
- has_gps: true only when the paper says the bikes have GPS / a GPS subscription.
- remarks: anything a person must check — crossed-out or handwritten changes, unreadable parts, pages that seem missing. Keep it short, and write it in {{REMARKS_LANGUAGE}}.
- confidence: how legible and complete the pages were overall.

Call the record_agreement tool exactly once.`;

const TOOL = {
  name: "record_agreement",
  description: "Record what the agreement pages show.",
  input_schema: {
    type: "object",
    properties: {
      customer_name: { type: ["string", "null"] },
      department: { type: ["string", "null"] },
      contract_type: { type: ["string", "null"], description: "K1, K3, K5 or K10 — only when written" },
      term_years: { type: ["integer", "null"] },
      signed_on: { type: ["string", "null"], description: "YYYY-MM-DD" },
      signatories: { type: ["string", "null"] },
      price_amount: { type: ["number", "null"] },
      price_period: { type: ["string", "null"], description: "month or year" },
      currency: { type: ["string", "null"], description: "ISO code, e.g. DKK" },
      has_gps: { type: ["boolean", "null"] },
      frames: {
        type: "array",
        items: {
          type: "object",
          properties: {
            frame_number: { type: "string" },
            description: { type: ["string", "null"], description: "Make / type in the same row" },
          },
          required: ["frame_number"],
        },
      },
      remarks: { type: ["string", "null"] },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: ["frames", "confidence"],
  },
} as const;

export async function readAgreementDocument(
  pages: DocumentPage[],
  opts: { provider: string; model: string; remarksLanguage: "da" | "en" },
): Promise<ReadDocumentResult> {
  if (pages.length === 0) return { ok: false, reason: "no_pages" };
  if (opts.provider !== "anthropic") {
    return { ok: false, reason: "unknown_provider", detail: opts.provider };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };

  const content: unknown[] = pages.map((p) =>
    p.mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: p.mime, data: p.base64 } }
      : { type: "image", source: { type: "base64", media_type: p.mime, data: p.base64 } },
  );
  content.push({
    type: "text",
    text:
      pages.length === 1
        ? "Here is the agreement. Read it and record it."
        : `Here are the ${pages.length} pages of the agreement, in order. Read them and record it.`,
  });

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
        model: opts.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT.replace(
          "{{REMARKS_LANGUAGE}}",
          opts.remarksLanguage === "da" ? "Danish" : "English",
        ),
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, reason: "api_error", detail: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: "api_error", detail: `${res.status} ${text}`.trim().slice(0, 500) };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: "api_error", detail: "invalid JSON response" };
  }
  const content_ = (json as { content?: unknown }).content;
  const block = Array.isArray(content_)
    ? content_.find(
        (b) =>
          b &&
          typeof b === "object" &&
          (b as { type?: unknown }).type === "tool_use" &&
          (b as { name?: unknown }).name === TOOL.name,
      )
    : null;
  if (!block) return { ok: false, reason: "api_error", detail: "no tool_use in response" };
  const input = (block as { input?: unknown }).input ?? {};
  return { ok: true, reading: parseAgreementReading(input), raw: input };
}
