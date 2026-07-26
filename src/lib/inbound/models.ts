/**
 * Model DISCOVERY for the extraction provider — the live list behind the
 * admin model picker, plus the probe behind its "Test" button.
 *
 * Why this exists: the model used to be a free-text box. A typo or a retired
 * model id doesn't fail at save time, it fails at 3 a.m. inside the pipeline
 * and surfaces as a generic `api_error` — which, in shadow mode, nobody sees
 * for days. So the admin picks from what the API says actually exists, and can
 * prove the pick works before leaving the page.
 *
 * Two deliberate properties:
 *  - The list is LIVE (`GET /v1/models`), never a hardcoded array. A newly
 *    released model is selectable the day it ships, with no code change.
 *  - Free text still wins. `listModels` failing (no key, offline, a future
 *    provider with no catalogue endpoint) must never block saving a model id
 *    the admin knows is right — discovery is an aid, not a gate.
 *
 * Provider-scoped by design: `/v1/models` is a first-party Anthropic endpoint
 * and does not exist on Bedrock / Vertex / Foundry. A future adapter for
 * another provider supplies its own lister here, keyed off the same registry
 * as everything else (see the config doctrine in CLAUDE.md).
 *
 * Server-only (reads process.env). Import from server actions.
 */
const ANTHROPIC_MODELS_ENDPOINT = "https://api.anthropic.com/v1/models";
const ANTHROPIC_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const PAGE_LIMIT = 100;
/** Model catalogues change on the order of weeks; an hour is plenty. */
const CACHE_TTL_MS = 60 * 60 * 1000;

export type ModelOption = {
  id: string;
  /** Human label from the API (e.g. "Claude Sonnet 5"); falls back to the id. */
  displayName: string;
  /** Context window, tokens. Null when the API omits it (older responses). */
  maxInputTokens: number | null;
  /** Output cap, tokens. Null when the API omits it. */
  maxTokens: number | null;
  /**
   * True for a bare alias (`claude-sonnet-5`), false for a dated snapshot
   * (`claude-haiku-4-5-20251001`). Aliases roll forward onto the next release;
   * snapshots pin you and eventually retire — so the picker sorts aliases
   * first and the form nudges toward them.
   */
  isAlias: boolean;
};

export type ListModelsResult =
  | { ok: true; models: ModelOption[] }
  | { ok: false; reason: "no_key" | "unsupported_provider" | "api_error"; detail?: string };

type CacheEntry = { at: number; models: ModelOption[] };
const cache = new Map<string, CacheEntry>();

/** A trailing `-YYYYMMDD` marks a pinned snapshot rather than a rolling alias. */
function isAliasId(id: string): boolean {
  return !/-\d{8}$/.test(id);
}

function toOption(raw: Record<string, unknown>): ModelOption | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id,
    displayName: typeof raw.display_name === "string" ? raw.display_name : id,
    maxInputTokens: num(raw.max_input_tokens),
    maxTokens: num(raw.max_tokens),
    isAlias: isAliasId(id),
  };
}

/**
 * Every model this API key can actually use, newest-capable first.
 *
 * Sort order is what the admin reads top-down: aliases before snapshots (rule
 * 2 above), then newest first within each group — so the current generation
 * sits at the top and the pinned historical ids sink.
 */
export async function listModels(provider: string): Promise<ListModelsResult> {
  if (provider !== "anthropic") {
    return { ok: false, reason: "unsupported_provider" };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };

  const hit = cache.get(provider);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ok: true, models: hit.models };
  }

  const models: ModelOption[] = [];
  // `/v1/models` paginates with after_id/has_more (NOT the page/next_page
  // scheme the newer endpoints use). Bounded so a pagination bug can't spin.
  let afterId: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL(ANTHROPIC_MODELS_ENDPOINT);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (afterId) url.searchParams.set("after_id", afterId);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      });
    } catch (e) {
      return { ok: false, reason: "api_error", detail: (e as Error).message };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, reason: "api_error", detail: `${res.status} ${text}`.trim() };
    }

    const body = (await res.json().catch(() => null)) as {
      data?: unknown;
      has_more?: unknown;
      last_id?: unknown;
    } | null;
    const rows = Array.isArray(body?.data) ? body.data : [];
    for (const row of rows) {
      const opt = row && typeof row === "object" ? toOption(row as Record<string, unknown>) : null;
      if (opt) models.push(opt);
    }
    if (body?.has_more !== true || typeof body.last_id !== "string") break;
    afterId = body.last_id;
  }

  models.sort((a, b) => {
    if (a.isAlias !== b.isAlias) return a.isAlias ? -1 : 1;
    return b.id.localeCompare(a.id);
  });

  cache.set(provider, { at: Date.now(), models });
  return { ok: true, models };
}

export type TestModelResult =
  | { ok: true; model: string }
  | { ok: false; reason: "no_key" | "unsupported_provider" | "api_error"; detail?: string };

/**
 * Prove a model id works for the job we actually give it.
 *
 * Deliberately not a "hello" completion: both callers (extraction and the
 * command agent) depend on FORCED TOOL USE, so the probe forces a tool call.
 * A model that exists but can't be driven that way fails here — at the moment
 * the admin picks it — instead of silently degrading in the pipeline.
 *
 * Only the request shape common to every current model is sent (no thinking,
 * no sampling params), so the probe stays valid as models come and go.
 */
export async function testModel(provider: string, model: string): Promise<TestModelResult> {
  if (provider !== "anthropic") return { ok: false, reason: "unsupported_provider" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };
  const id = model.trim();
  if (!id) return { ok: false, reason: "api_error", detail: "empty model id" };

  const probe = {
    name: "ok",
    description: "Acknowledge. Call this tool with ok=true.",
    input_schema: {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
    },
  };

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_MESSAGES_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: id,
        max_tokens: 64,
        tools: [probe],
        tool_choice: { type: "tool", name: "ok" },
        messages: [{ role: "user", content: "Call the ok tool." }],
      }),
    });
  } catch (e) {
    return { ok: false, reason: "api_error", detail: (e as Error).message };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: "api_error", detail: `${res.status} ${text}`.trim() };
  }

  const body = (await res.json().catch(() => null)) as {
    content?: { type?: string }[];
  } | null;
  const calledTool = (body?.content ?? []).some((b) => b?.type === "tool_use");
  if (!calledTool) {
    return { ok: false, reason: "api_error", detail: "model did not return a tool call" };
  }
  return { ok: true, model: id };
}
