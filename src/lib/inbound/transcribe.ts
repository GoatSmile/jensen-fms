/**
 * Inbound transcription stage (Slice B) — audio → text, provider-dispatched
 * per the inbound registry (settings.ts → TRANSCRIPTION_PROVIDERS). Thin
 * fetch wrappers, no SDKs (the house pattern: src/lib/email/send.ts,
 * src/lib/economic/client.ts, src/lib/inbound/extract.ts). API keys are
 * SECRETS (env, config doctrine tier 1); the provider selection + its
 * non-secret params (Azure's region) live in app_settings.
 *
 * Adapters:
 *  - `gladia`  — EU-native async API: POST the audio URL, poll the result.
 *    Live-verified 2026-07-15. No region param.
 *  - `azure`   — Speech "fast transcription" synchronous REST (multipart
 *    audio bytes + locales definition). CONTRACT-VERIFIED ONLY — written from
 *    the documented API shape without a key (the e-conomic/Resend pattern);
 *    the first run with a real AZURE_SPEECH_KEY is the live test. Needs
 *    inbound_transcription_region (e.g. `westeurope`).
 *
 * Both audio inputs arrive as a short-lived signed URL to the private
 * `inbound` bucket (minted by the channel adapter); Gladia fetches it
 * itself, the Azure adapter downloads the bytes and re-uploads.
 *
 * Server-only (reads process.env). Import from server actions.
 */

export type TranscribeResult =
  | { ok: true; text: string; language: string | null }
  | {
      ok: false;
      reason:
        | "no_key"
        | "no_region"
        | "unknown_provider"
        | "api_error"
        | "timeout"
        | "empty";
      detail?: string;
    };

export async function transcribeAudio(
  audioUrl: string,
  opts: { provider: string; region: string | null },
): Promise<TranscribeResult> {
  if (opts.provider === "gladia") return transcribeViaGladia(audioUrl);
  if (opts.provider === "azure") return transcribeViaAzure(audioUrl, opts.region);
  return { ok: false, reason: "unknown_provider", detail: opts.provider };
}

function caught(e: unknown): TranscribeResult {
  return {
    ok: false,
    reason: "api_error",
    detail: e instanceof Error ? e.message : String(e),
  };
}

async function httpDetail(res: Response): Promise<TranscribeResult> {
  const text = await res.text().catch(() => "");
  return { ok: false, reason: "api_error", detail: `${res.status} ${text}`.trim() };
}

// ---------------------------------------------------------------------------
// Gladia — async: init job with the audio URL, then poll until done.
// Voicemails are short (< 2 min), so a ~90 s poll window is generous.
// ---------------------------------------------------------------------------
const GLADIA_INIT_URL = "https://api.gladia.io/v2/pre-recorded";
const GLADIA_POLL_INTERVAL_MS = 1_000;
const GLADIA_POLL_TIMEOUT_MS = 90_000;

async function transcribeViaGladia(audioUrl: string): Promise<TranscribeResult> {
  const apiKey = process.env.GLADIA_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };

  let initRes: Response;
  try {
    initRes = await fetch(GLADIA_INIT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-gladia-key": apiKey },
      body: JSON.stringify({
        audio_url: audioUrl,
        // The workshop's two languages; detection picks per file.
        language_config: { languages: ["da", "en"], code_switching: false },
      }),
    });
  } catch (e) {
    return caught(e);
  }
  if (!initRes.ok) return httpDetail(initRes);

  const init = (await initRes.json().catch(() => null)) as {
    id?: string;
    result_url?: string;
  } | null;
  const resultUrl =
    init?.result_url ?? (init?.id ? `${GLADIA_INIT_URL}/${init.id}` : null);
  if (!resultUrl) {
    return { ok: false, reason: "api_error", detail: "no result_url in init response" };
  }

  const deadline = Date.now() + GLADIA_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, GLADIA_POLL_INTERVAL_MS));

    let pollRes: Response;
    try {
      pollRes = await fetch(resultUrl, { headers: { "x-gladia-key": apiKey } });
    } catch (e) {
      return caught(e);
    }
    if (!pollRes.ok) return httpDetail(pollRes);

    const json = (await pollRes.json().catch(() => null)) as {
      status?: string;
      error_code?: unknown;
      result?: {
        transcription?: { full_transcript?: unknown; languages?: unknown };
      };
    } | null;
    if (!json) {
      return { ok: false, reason: "api_error", detail: "invalid JSON poll response" };
    }
    if (json.status === "error") {
      return {
        ok: false,
        reason: "api_error",
        detail: `Gladia job failed${json.error_code ? ` (${String(json.error_code)})` : ""}`,
      };
    }
    if (json.status === "done") {
      const t = json.result?.transcription;
      const text =
        typeof t?.full_transcript === "string" ? t.full_transcript.trim() : "";
      if (!text) return { ok: false, reason: "empty" };
      const langs = Array.isArray(t?.languages) ? t.languages : [];
      const language = typeof langs[0] === "string" ? langs[0] : null;
      return { ok: true, text, language };
    }
    // queued / processing → keep polling
  }
  return { ok: false, reason: "timeout" };
}

// ---------------------------------------------------------------------------
// Azure Speech — "fast transcription" synchronous REST. Contract-verified;
// first run with a real key is the live test.
// ---------------------------------------------------------------------------
const AZURE_API_VERSION = "2024-11-15";

async function transcribeViaAzure(
  audioUrl: string,
  region: string | null,
): Promise<TranscribeResult> {
  const apiKey = process.env.AZURE_SPEECH_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };
  const trimmedRegion = region?.trim();
  if (!trimmedRegion) return { ok: false, reason: "no_region" };

  // The fast-transcription endpoint takes the audio bytes, not a URL.
  let audio: Blob;
  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return { ok: false, reason: "api_error", detail: `audio fetch ${audioRes.status}` };
    }
    audio = await audioRes.blob();
  } catch (e) {
    return caught(e);
  }

  const form = new FormData();
  form.set("audio", audio, "voicemail");
  form.set("definition", JSON.stringify({ locales: ["da-DK", "en-US"] }));

  let res: Response;
  try {
    res = await fetch(
      `https://${trimmedRegion}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=${AZURE_API_VERSION}`,
      {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
        body: form,
      },
    );
  } catch (e) {
    return caught(e);
  }
  if (!res.ok) return httpDetail(res);

  const json = (await res.json().catch(() => null)) as {
    combinedPhrases?: { text?: unknown }[];
    phrases?: { locale?: unknown }[];
  } | null;
  if (!json) {
    return { ok: false, reason: "api_error", detail: "invalid JSON response" };
  }
  const text = (json.combinedPhrases ?? [])
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join(" ")
    .trim();
  if (!text) return { ok: false, reason: "empty" };
  const locale = json.phrases?.find((p) => typeof p.locale === "string")?.locale;
  // "da-DK" → "da", matching the ISO 639-1 codes Gladia returns.
  const language = typeof locale === "string" ? locale.slice(0, 2) : null;
  return { ok: true, text, language };
}
