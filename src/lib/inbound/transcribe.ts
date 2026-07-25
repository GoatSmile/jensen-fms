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
  | {
      ok: true;
      text: string;
      language: string | null;
      confidence: number | null;
      /**
       * Set when the transcript carries speaker labels AND those labels were
       * GUESSED by diarization rather than read off separate audio channels.
       * The dialogue extraction prompt is warned when this is true, so a wrong
       * guess degrades to "ambiguous" instead of a confident misattribution.
       */
      speakersInferred?: boolean;
    }
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

export type TranscribeOptions = {
  provider: string;
  region: string | null;
  /**
   * Number of audio channels worth transcribing SEPARATELY. 2 for a Twilio
   * dual-channel bridged call, where channel 1 is the customer and channel 2
   * is us by Twilio's contract — so per-channel transcription makes speaker
   * attribution a fact. Providers that can't split channels fall back to
   * diarization with a speaker-count hint (and set `speakersInferred`).
   * Omitted / 1 → today's single-speaker voicemail path, unchanged.
   */
  channels?: number;
};

export async function transcribeAudio(
  audioUrl: string,
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const twoWay = (opts.channels ?? 1) >= 2;
  if (opts.provider === "gladia") return transcribeViaGladia(audioUrl, twoWay);
  if (opts.provider === "azure") {
    return transcribeViaAzure(audioUrl, opts.region, twoWay);
  }
  return { ok: false, reason: "unknown_provider", detail: opts.provider };
}

/**
 * Turn labels. On the CHANNEL path these are authoritative: Twilio puts the
 * inbound caller on the first channel and the answering party on the second,
 * so channel 0 IS the customer and channel 1 IS us (verified against a real
 * bridged call 2026-07-25). On the diarization fallback we can't know which is
 * which, so the neutral "Speaker N" labels are used and flagged as inferred.
 */
const CHANNEL_LABELS = ["Customer", "Workshop"] as const;

function labelFor(index: number, deterministic: boolean): string {
  if (deterministic) return CHANNEL_LABELS[index] ?? `Channel ${index}`;
  return `Speaker ${index + 1}`;
}

/**
 * Render per-channel/diarized utterances as a readable dialogue, collapsing
 * consecutive turns by the same speaker so the transcript reads like a
 * conversation rather than a stutter of one-line labels.
 */
function renderDialogue(
  turns: { speaker: number; text: string }[],
  deterministic = false,
): string {
  const lines: string[] = [];
  let current: { speaker: number; parts: string[] } | null = null;
  for (const turn of turns) {
    const text = turn.text.trim();
    if (!text) continue;
    if (current && current.speaker === turn.speaker) {
      current.parts.push(text);
      continue;
    }
    if (current) {
      lines.push(
        `${labelFor(current.speaker, deterministic)}: ${current.parts.join(" ")}`,
      );
    }
    current = { speaker: turn.speaker, parts: [text] };
  }
  if (current) {
    lines.push(
      `${labelFor(current.speaker, deterministic)}: ${current.parts.join(" ")}`,
    );
  }
  return lines.join("\n");
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

/**
 * Aggregate per-segment acoustic confidences into one 0..1 clarity score,
 * weighting each segment by its word count so a long clear sentence counts
 * more than a one-word "hmm". Returns null if no segment reported confidence.
 */
function aggregateConfidence(
  segments: { confidence: unknown; weight?: number }[],
): number | null {
  let sum = 0;
  let weightTotal = 0;
  for (const seg of segments) {
    if (typeof seg.confidence === "number" && Number.isFinite(seg.confidence)) {
      const weight = seg.weight && seg.weight > 0 ? seg.weight : 1;
      sum += seg.confidence * weight;
      weightTotal += weight;
    }
  }
  return weightTotal > 0 ? sum / weightTotal : null;
}

// ---------------------------------------------------------------------------
// Gladia — async: init job with the audio URL, then poll until done.
// Voicemails are short (< 2 min), so a ~90 s poll window is generous.
// ---------------------------------------------------------------------------
const GLADIA_INIT_URL = "https://api.gladia.io/v2/pre-recorded";
const GLADIA_POLL_INTERVAL_MS = 1_000;
const GLADIA_POLL_TIMEOUT_MS = 90_000;

async function transcribeViaGladia(
  audioUrl: string,
  twoWay = false,
): Promise<TranscribeResult> {
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
        // NOTE (2026-07-25): deliberately NO diarization for two-way calls.
        // Gladia transcribes multi-channel audio AUTOMATICALLY and tags every
        // utterance with `channel` — which, on a Twilio dual-channel recording,
        // IS the speaker (caller = channel 0, us = channel 1). Reading the
        // channel is deterministic; asking for diarization on the same file
        // returned FOUR speakers for a two-person call. So we let the automatic
        // channel handling do the work and read `utterance.channel`.
        // Billing note: two channels with different content bill as two audios
        // — pennies at this volume, and worth it for real attribution.
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
        transcription?: {
          full_transcript?: unknown;
          languages?: unknown;
          utterances?: {
            confidence?: unknown;
            words?: unknown[];
            text?: unknown;
            speaker?: unknown;
            /** Source audio channel — present automatically for multi-channel
             *  audio, and the deterministic speaker signal on a bridged call. */
            channel?: unknown;
          }[];
        };
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
      const flat =
        typeof t?.full_transcript === "string" ? t.full_transcript.trim() : "";
      const langs = Array.isArray(t?.languages) ? t.languages : [];
      const language = typeof langs[0] === "string" ? langs[0] : null;
      const utterances = Array.isArray(t?.utterances) ? t.utterances : [];
      const confidence = aggregateConfidence(
        utterances.map((u) => ({
          confidence: u?.confidence,
          weight: Array.isArray(u?.words) ? u.words.length : 1,
        })),
      );

      // Two-way call: build the dialogue from the CHANNEL tag, which is a fact
      // (Twilio's channel contract) rather than a diarization guess. Falls back
      // to `speaker` only if the file turned out to be mono — a labelled-but-
      // inferred transcript still beats an unlabelled one.
      if (twoWay) {
        const channelTurns = utterances
          .map((u) => ({
            speaker: typeof u?.channel === "number" ? u.channel : -1,
            text: typeof u?.text === "string" ? u.text : "",
          }))
          .filter((u) => u.speaker >= 0 && u.text.trim() !== "");
        const distinctChannels = new Set(channelTurns.map((t) => t.speaker));
        if (channelTurns.length > 0 && distinctChannels.size >= 2) {
          const dialogue = renderDialogue(channelTurns, true);
          if (dialogue) {
            // Deterministic — no `speakersInferred` flag.
            return { ok: true, text: dialogue, language, confidence };
          }
        }

        // Mono (or single-channel) audio on the call path: fall back to
        // whatever diarization the response happened to carry, clearly flagged.
        const speakerTurns = utterances
          .map((u) => ({
            speaker: typeof u?.speaker === "number" ? u.speaker : 0,
            text: typeof u?.text === "string" ? u.text : "",
          }))
          .filter((u) => u.text.trim() !== "");
        const inferred = renderDialogue(speakerTurns, false);
        if (inferred && new Set(speakerTurns.map((t) => t.speaker)).size >= 2) {
          return {
            ok: true,
            text: inferred,
            language,
            confidence,
            speakersInferred: true,
          };
        }
      }

      if (!flat) return { ok: false, reason: "empty" };
      return { ok: true, text: flat, language, confidence };
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
  twoWay = false,
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
  form.set("audio", audio, twoWay ? "call" : "voicemail");
  // Two-way call: transcribe the stereo channels SEPARATELY. Twilio's contract
  // ("the parent call will always be in the first channel") makes channel 0 the
  // customer and channel 1 us — deterministic attribution, no diarization
  // guess. Verified 2026-07-23: Azure supports `channels` for up to two
  // channels, and CANNOT combine it with diarization (that's mono-only), so
  // these are deliberately exclusive.
  form.set(
    "definition",
    JSON.stringify({
      locales: ["da-DK", "en-US"],
      ...(twoWay ? { channels: [0, 1] } : {}),
    }),
  );

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
    combinedPhrases?: { text?: unknown; channel?: unknown }[];
    phrases?: {
      locale?: unknown;
      confidence?: unknown;
      text?: unknown;
      channel?: unknown;
      offsetMilliseconds?: unknown;
    }[];
  } | null;
  if (!json) {
    return { ok: false, reason: "api_error", detail: "invalid JSON response" };
  }
  const flat = (json.combinedPhrases ?? [])
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join(" ")
    .trim();
  const locale = json.phrases?.find((p) => typeof p.locale === "string")?.locale;
  // "da-DK" → "da", matching the ISO 639-1 codes Gladia returns.
  const language = typeof locale === "string" ? locale.slice(0, 2) : null;
  const confidence = aggregateConfidence(
    (json.phrases ?? []).map((p) => ({
      confidence: p.confidence,
      weight: typeof p.text === "string" ? p.text.split(/\s+/).length : 1,
    })),
  );

  // Per-channel request: interleave the two channels' phrases by time into one
  // dialogue. Attribution is NOT inferred here — the channel IS the speaker.
  if (twoWay) {
    const turns = (json.phrases ?? [])
      .filter((p) => typeof p.text === "string" && p.text.trim() !== "")
      .map((p) => ({
        speaker: typeof p.channel === "number" ? p.channel : 0,
        text: String(p.text),
        at:
          typeof p.offsetMilliseconds === "number" ? p.offsetMilliseconds : 0,
      }))
      .sort((a, b) => a.at - b.at);
    const dialogue = renderDialogue(turns, true);
    if (dialogue) {
      return { ok: true, text: dialogue, language, confidence };
    }
  }

  if (!flat) return { ok: false, reason: "empty" };
  return { ok: true, text: flat, language, confidence };
}
