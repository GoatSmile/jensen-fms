import "server-only";

/**
 * The ONE door to Anthropic's Messages API. Every caller in the app —
 * extraction, the agreement-paper reader, the command agent, the model Test —
 * goes through `postMessages`, and every caller that needs JSON back goes
 * through `requestStructured`. A thin fetch wrapper, the house pattern (no
 * SDK dependency), kept in one file so a change of API shape is one edit.
 *
 * THE PORTABILITY RULE — send only what every current Claude model accepts,
 * because the model is an admin setting and changes without a deploy:
 *   - no forced `tool_choice` (`tool` / `any`) — rejected with a 400 by
 *     Sonnet 5.5, Opus 5.5 and Fable 5.1 (found 2026-09-30 when the model
 *     was switched to claude-sonnet-5-5 and extraction stopped). Structured
 *     JSON comes from `output_config.format` instead; tools stay `auto`.
 *   - no `temperature` / `top_p` / `top_k` — non-default values are 400s on
 *     the newest models.
 *   - no `thinking` configuration — `disabled` and `budget_tokens` are 400s
 *     on several models; omitting it is valid everywhere.
 *   - no assistant prefill — a 400 on every model since the 4.6 family.
 * Anything model-specific must be opt-in per model, never sent by default.
 * The model Test (src/lib/inbound/models.ts) runs the REAL request shapes,
 * and saving a model is refused when it fails, so a model that cannot run
 * the pipeline is caught at the moment it is chosen.
 */
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export type MessagesFailure = {
  ok: false;
  reason: "no_key" | "api_error" | "refused" | "truncated" | "invalid_output";
  detail?: string;
};

/** Retries after the first attempt — the same policy as Anthropic's SDKs. */
const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

/**
 * POST a Messages request as-is. Callers own the body; this owns transport,
 * including the retry the official SDKs do and our hand-written clients never
 * did: connection errors, 408/409/429 and 5xx/529 are retried up to twice
 * with backoff (honouring `retry-after`). A 4xx is the request's fault and is
 * returned at once; our own timeout is not retried.
 */
export async function postMessages(
  body: Record<string, unknown>,
  opts: {
    timeoutMs?: number;
    /**
     * STREAM the response and report each tool's input as it grows (the
     * accumulated JSON so far) — the secretary speaks its first sentence while
     * the rest is written (2026-10-22). The result is the same `json` a plain
     * request returns, rebuilt from the events, so callers do not change.
     */
    onToolInput?: (name: string, partialJson: string) => void;
  } = {},
): Promise<{ ok: true; json: Record<string, unknown> } | MessagesFailure> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };
  const streaming = typeof opts.onToolInput === "function";
  const payload = JSON.stringify(streaming ? { ...body, stream: true } : body);
  /** Once the caller has seen a fragment, a retry would repeat it — so none. */
  let reported = false;
  const report = streaming
    ? (name: string, json: string) => {
        reported = true;
        opts.onToolInput!(name, json);
      }
    : null;
  let last: MessagesFailure = { ok: false, reason: "api_error", detail: "no attempt made" };
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, backoffMs(attempt)));
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: payload,
        ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      last = { ok: false, reason: "api_error", detail: e instanceof Error ? e.message : String(e) };
      if (name === "TimeoutError" || name === "AbortError") return last;
      continue; // connection error — retry
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      last = { ok: false, reason: "api_error", detail: `${res.status} ${text}`.trim().slice(0, 600) };
      if (!RETRYABLE_STATUS.has(res.status)) return last;
      const after = Number(res.headers.get("retry-after"));
      if (Number.isFinite(after) && after > 0 && after <= 20) {
        await new Promise((r) => setTimeout(r, after * 1000));
      }
      continue;
    }
    if (report) {
      const read = await readStream(res, report);
      if (read.ok) return read;
      last = read;
      if (reported) return last;
      continue; // broke before anything was passed on — like a connection error
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) return { ok: false, reason: "api_error", detail: "invalid JSON response" };
    return { ok: true, json };
  }
  return last;
}

type StreamBlock = Record<string, unknown> & { type: string; _json?: string };

/**
 * A streamed Messages response → the message a plain request returns. Every
 * block is rebuilt whole — text, tool_use (input parsed at the end), and
 * THINKING with its signature, which must go back verbatim on the next call
 * of a tool loop or the API refuses it ("each thinking block must contain
 * thinking", found 2026-10-22 by a probe that skipped them). A tool input
 * that is not valid JSON (possible with `eager_input_streaming`, which skips
 * the API's own check) arrives as `input: {}` with `invalid_input: true`.
 */
async function readStream(
  res: Response,
  report: (name: string, json: string) => void,
): Promise<{ ok: true; json: Record<string, unknown> } | MessagesFailure> {
  if (!res.body) return { ok: false, reason: "api_error", detail: "empty stream" };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const blocks: StreamBlock[] = [];
  let message: Record<string, unknown> = {};
  let usage: Record<string, unknown> = {};
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const ev = JSON.parse(data) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
        switch (ev.type) {
          case "message_start":
            message = { ...ev.message };
            usage = { ...(ev.message?.usage ?? {}) };
            break;
          case "content_block_start":
            blocks[ev.index] = { ...ev.content_block, ...(ev.content_block?.type === "tool_use" ? { _json: "" } : {}) };
            break;
          case "content_block_delta": {
            const b = blocks[ev.index];
            const d = ev.delta ?? {};
            if (!b) break;
            if (d.type === "text_delta") b.text = `${(b.text as string) ?? ""}${d.text}`;
            else if (d.type === "thinking_delta") b.thinking = `${(b.thinking as string) ?? ""}${d.thinking}`;
            else if (d.type === "signature_delta") b.signature = `${(b.signature as string) ?? ""}${d.signature}`;
            else if (d.type === "input_json_delta") {
              b._json = `${b._json ?? ""}${d.partial_json ?? ""}`;
              report(String(b.name ?? ""), b._json);
            }
            break;
          }
          case "message_delta":
            message = { ...message, ...(ev.delta ?? {}) };
            usage = { ...usage, ...(ev.usage ?? {}) };
            break;
          case "error":
            return { ok: false, reason: "api_error", detail: `stream ${JSON.stringify(ev.error ?? ev).slice(0, 500)}` };
        }
      }
    }
  } catch (e) {
    return { ok: false, reason: "api_error", detail: e instanceof Error ? e.message : String(e) };
  }
  const content = blocks.filter(Boolean).map(({ _json, ...b }) => {
    if (b.type !== "tool_use") return b;
    if (!_json) return { ...b, input: {} };
    try {
      return { ...b, input: JSON.parse(_json) };
    } catch {
      return { ...b, input: {}, invalid_input: true };
    }
  });
  return { ok: true, json: { ...message, content, usage } };
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
}

/**
 * Make a JSON Schema acceptable to structured outputs, so no caller has to
 * know the compiler's rules: every object gets `additionalProperties: false`
 * (required), and a nullable enum is rewritten as `anyOf` (the type-list form
 * is rejected). Pure; returns a copy. The model Test compiles every schema the
 * app sends, so a new rule the compiler learns shows up there first.
 */
export function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== "object") return schema;
  const node = schema as Record<string, unknown>;
  // A nullable enum written as `type: ["string","null"]` + `enum: [..., null]`
  // is valid JSON Schema but REJECTED by the structured-outputs compiler
  // ("Enum value 'low' does not match declared type"). Rewrite it to the form
  // it accepts: anyOf a typed enum without the null, or null.
  if (Array.isArray(node.type) && node.type.includes("null") && Array.isArray(node.enum)) {
    const { type, enum: values, ...rest } = node;
    const nonNull = (type as unknown[]).filter((t) => t !== "null");
    return {
      ...rest,
      anyOf: [
        { type: nonNull.length === 1 ? nonNull[0] : nonNull, enum: (values as unknown[]).filter((v) => v !== null) },
        { type: "null" },
      ],
    };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = k === "enum" || k === "required" ? v : strictSchema(v);
  }
  const type = out.type;
  const isObject = type === "object" || (Array.isArray(type) && type.includes("object"));
  if (isObject && out.properties && out.additionalProperties === undefined) {
    out.additionalProperties = false;
  }
  return out;
}

/**
 * Ask for JSON that matches `schema`, with constrained decoding
 * (`output_config.format`) — valid on every current model, unlike a forced
 * tool. The answer is the response's text block, parsed. A refusal or a
 * `max_tokens` stop can return output that does NOT match the schema, so both
 * are failures here, never half-parsed JSON.
 */
export async function requestStructured(opts: {
  model: string;
  system?: string;
  content: string | unknown[];
  schema: unknown;
  maxTokens: number;
  timeoutMs?: number;
}): Promise<{ ok: true; value: unknown } | MessagesFailure> {
  const posted = await postMessages(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: opts.content }],
      output_config: { format: { type: "json_schema", schema: strictSchema(opts.schema) } },
    },
    { timeoutMs: opts.timeoutMs },
  );
  if (!posted.ok) return posted;
  const stop = posted.json.stop_reason;
  if (stop === "refusal") return { ok: false, reason: "refused", detail: "the model declined" };
  if (stop === "max_tokens") return { ok: false, reason: "truncated", detail: "the answer was cut off" };
  const content = Array.isArray(posted.json.content) ? posted.json.content : [];
  const text = content
    .filter((b): b is { type: string; text: string } => !!b && (b as { type?: unknown }).type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) return { ok: false, reason: "invalid_output", detail: "no text in the response" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "invalid_output", detail: "the answer was not valid JSON" };
  }
}
