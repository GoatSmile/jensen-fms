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
 * Two callers now: the voicemail channel, and the DICTATE button
 * (src/lib/dictation/) — the same capability, so the same provider selection
 * and the same key. A caller that pins `languages` or shortens `timeoutMs` is
 * the interactive one; the voicemail path passes neither.
 *
 * NOTE for local work: the provider FETCHES the signed URL, so a dev server
 * pointed at the local Supabase (127.0.0.1) cannot transcribe — Gladia cannot
 * reach it. Point at production (`scripts/use-db.sh prod`) to exercise this
 * end to end.
 *
 * Server-only (reads process.env). Import from server actions.
 */

import { audioChannelCount } from "./audio/mp3-repair";
import { isPubliclyReachableUrl } from "@/lib/net/public-url";

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
  /**
   * Is the channel ORDER a fact? `caller_first` = Twilio's contract (channel
   * 0 is the caller, i.e. the customer on an inbound call), so channel labels
   * render as Customer / Workshop and are trusted. `unknown` = any other source
   * (Relatel records incoming mobile calls in stereo with no stated order):
   * the channels still separate the voices, but the labels are the neutral
   * "Speaker N" and flagged `speakersInferred`, so the extraction prompt works
   * out the sides from context instead of trusting a guess. Default
   * `caller_first` keeps the Twilio path unchanged.
   */
  channelRoles?: "caller_first" | "unknown";
  /** ElevenLabs only: which host processes the audio (migration 113/114). */
  elevenlabsRegion?: "eu" | "global" | "us";
  /**
   * ElevenLabs only: names the engine should expect — customers, colleagues,
   * bike models. Munr measured this as the largest single accuracy win (four
   * engines misspelt one name until it was on the list). Vendor limits: 1,000
   * terms, 50 characters, five words each; longer ones are dropped.
   */
  keyterms?: string[];
  /**
   * ISO 639-1 codes to transcribe as, narrowing the shipped default of "the
   * workshop's two languages, detected per file". Pinning ONE helps where
   * detection is weakest — a short dictated phrase — but the owner wants no
   * language toggle (2026-10-08), so dictation and notes run UNPINNED first and
   * pin only on a re-run, when `isWorkshopLanguage` says detection missed. Shape borrowed from Munin's copy of this module so the two stay
   * diffable. Adapters map to their own vocabulary (Azure wants locales).
   */
  languages?: string[];
  /**
   * How long to wait for an async provider before giving up. Defaults to the
   * voicemail window; an interactive caller passes less, because a platform
   * function timeout kills the request with no error the UI can show, while a
   * clean `timeout` leaves the audio in the browser to retry.
   */
  timeoutMs?: number;
};

export async function transcribeAudio(
  audioUrl: string,
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const twoWay = (opts.channels ?? 1) >= 2;
  const trustChannels = (opts.channelRoles ?? "caller_first") === "caller_first";
  if (opts.provider === "gladia") {
    return transcribeViaGladia(audioUrl, twoWay, opts.languages, opts.timeoutMs, trustChannels);
  }
  if (opts.provider === "azure") {
    return transcribeViaAzure(audioUrl, opts.region, twoWay, opts.languages, trustChannels);
  }
  if (opts.provider === "elevenlabs") {
    return transcribeViaElevenLabs(audioUrl, {
      twoWay,
      trustChannels,
      languages: opts.languages,
      region: opts.elevenlabsRegion ?? "global",
      keyterms: opts.keyterms ?? [],
      timeoutMs: opts.timeoutMs,
    });
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
const GLADIA_UPLOAD_URL = "https://api.gladia.io/v2/upload";
/** Far above any call; a runaway guard for bytes we hold in memory. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Hand Gladia the audio as BYTES instead of a link: download it ourselves
 * (our server can reach a local Supabase; Gladia's cannot) and POST it to
 * /v2/upload, which returns a URL Gladia can read. Used when the link is not
 * publicly reachable, and as the one retry when Gladia says it could not
 * fetch a link we believed was public.
 */
async function uploadToGladia(
  audioUrl: string,
  apiKey: string,
): Promise<{ ok: true; url: string } | { ok: false; detail: string }> {
  let res: Response;
  try {
    res = await fetch(audioUrl, { cache: "no-store" });
  } catch (e) {
    return { ok: false, detail: `could not read our own audio: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok) return { ok: false, detail: `could not read our own audio: HTTP ${res.status}` };
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0) return { ok: false, detail: "our audio is empty" };
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, detail: "audio too large to upload" };
  const form = new FormData();
  form.append(
    "audio",
    new Blob([bytes], { type: res.headers.get("content-type") || "application/octet-stream" }),
    "audio",
  );
  let up: Response;
  try {
    up = await fetch(GLADIA_UPLOAD_URL, {
      method: "POST",
      headers: { "x-gladia-key": apiKey },
      body: form,
    });
  } catch (e) {
    return { ok: false, detail: `upload failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  const json = (await up.json().catch(() => null)) as { audio_url?: string; message?: string } | null;
  if (!up.ok || !json?.audio_url) {
    return { ok: false, detail: `upload refused: ${up.status} ${json?.message ?? ""}`.trim() };
  }
  return { ok: true, url: json.audio_url };
}
const GLADIA_POLL_INTERVAL_MS = 1_000;
const GLADIA_POLL_TIMEOUT_MS = 90_000;

/** The workshop's two languages — the default when a caller pins none. */
const DEFAULT_LANGUAGES = ["da", "en"] as const;

/**
 * Was the detected language one the workshop speaks? Detection runs unpinned
 * (owner, 2026-10-08: no language toggle — "the system should be smart enough"),
 * and its known miss is a short Danish phrase heard as Norwegian or Swedish.
 * A caller that gets `false` re-runs pinned to the person's own language.
 */
export function isWorkshopLanguage(code: string | null | undefined): boolean {
  return code != null && (DEFAULT_LANGUAGES as readonly string[]).includes(code);
}

async function transcribeViaGladia(
  audioUrl: string,
  twoWay = false,
  languages?: string[],
  timeoutMs?: number,
  trustChannels = true,
): Promise<TranscribeResult> {
  const apiKey = process.env.GLADIA_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };

  // A link Gladia's servers cannot open (the LOCAL Supabase is 127.0.0.1)
  // goes up as bytes first — see src/lib/net/public-url.ts.
  let uploaded = false;
  let sourceUrl = audioUrl;
  if (!isPubliclyReachableUrl(audioUrl)) {
    const up = await uploadToGladia(audioUrl, apiKey);
    if (!up.ok) return { ok: false, reason: "api_error", detail: up.detail };
    sourceUrl = up.url;
    uploaded = true;
  }

  const initGladia = async (url: string): Promise<Response | TranscribeResult> => {
    try {
      return await fetch(GLADIA_INIT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-gladia-key": apiKey },
      body: JSON.stringify({
        audio_url: url,
        // The caller's languages, else the workshop's two with detection
        // picking per file. One code means "transcribe as this", which is what
        // a dictating tech has already told us with the DA/EN chip.
        language_config: {
          languages: languages?.length ? languages : [...DEFAULT_LANGUAGES],
          code_switching: false,
        },
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
  };

  let initRes = await initGladia(sourceUrl);
  // Belt and braces: a link judged public that Gladia still cannot fetch
  // (a public name on a private address, a storage hiccup) gets ONE retry as
  // bytes — only on that specific complaint; a bad file stays a failure.
  if (!uploaded && initRes instanceof Response && initRes.status === 400) {
    const body = await initRes.clone().text().catch(() => "");
    if (/failed to fetch audio/i.test(body)) {
      const up = await uploadToGladia(audioUrl, apiKey);
      if (up.ok) initRes = await initGladia(up.url);
    }
  }
  if (!(initRes instanceof Response)) return initRes;
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

  const deadline = Date.now() + (timeoutMs ?? GLADIA_POLL_TIMEOUT_MS);
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
          const dialogue = renderDialogue(channelTurns, trustChannels);
          if (dialogue) {
            // Deterministic only when the channel order is a contract;
            // otherwise the voices are separated but WHO is who is a guess.
            return trustChannels
              ? { ok: true, text: dialogue, language, confidence }
              : { ok: true, text: dialogue, language, confidence, speakersInferred: true };
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

/** Azure speaks locales, not bare ISO codes. Our two, plus a safe passthrough
 *  for anything already written as a locale. */
const AZURE_LOCALES: Record<string, string> = { da: "da-DK", en: "en-US" };

function azureLocales(languages?: string[]): string[] {
  if (!languages?.length) return ["da-DK", "en-US"];
  return languages.map((l) => AZURE_LOCALES[l] ?? l);
}

// ---------------------------------------------------------------------------
// ElevenLabs Scribe v2 — SYNCHRONOUS: one request, the transcript in the
// response, no job to poll (so dictation cannot be left in a queue). Copied
// and trimmed from Munr's live-verified adapter (munr src/lib/inbound/
// transcribe.ts, 2026-09-09), fitted to this module's single-text result.
//
// The adapter always sends the BYTES, never a link: it reads them itself
// (our server can reach any storage, local or not — no "can the provider
// open this URL?" question) and it needs them anyway to count channels:
// stereo → each channel transcribed separately (the channel is the voice);
// mono two-way call → speaker separation, flagged as inferred.
// ---------------------------------------------------------------------------
const ELEVENLABS_HOSTS: Record<string, string> = {
  eu: "https://api.eu.residency.elevenlabs.io",
  global: "https://api.elevenlabs.io",
  us: "https://api.us.elevenlabs.io",
};
const ELEVENLABS_MODEL = "scribe_v2";
const ELEVENLABS_TIMEOUT_MS = 120_000;
/** One voice stays one turn until it pauses longer than this. */
const ELEVENLABS_TURN_GAP_SECONDS = 2;

/** Scribe reports ISO 639-3 ("dan"); the app stores ISO 639-1 ("da"). */
const ISO3_TO_1: Record<string, string> = {
  dan: "da", eng: "en", deu: "de", ger: "de", swe: "sv", nor: "no", nob: "no", nno: "no",
  fin: "fi", pol: "pl", nld: "nl", dut: "nl", fra: "fr", fre: "fr", spa: "es", ita: "it",
  ukr: "uk", rus: "ru", ara: "ar", tur: "tr", ron: "ro", rum: "ro", lit: "lt", lav: "lv", est: "et",
};
function iso1(code: unknown): string | null {
  if (typeof code !== "string" || !code.trim()) return null;
  const c = code.trim().toLowerCase();
  return c.length === 2 ? c : (ISO3_TO_1[c] ?? c);
}

type ScribeWord = {
  text?: unknown;
  type?: unknown;
  start?: unknown;
  end?: unknown;
  logprob?: unknown;
  speaker_id?: unknown;
  channel_index?: unknown;
};
type ScribeTranscript = {
  language_code?: unknown;
  text?: unknown;
  words?: ScribeWord[];
  channel_index?: unknown;
};

async function transcribeViaElevenLabs(
  audioUrl: string,
  opts: {
    twoWay: boolean;
    trustChannels: boolean;
    languages?: string[];
    region: string;
    keyterms: string[];
    timeoutMs?: number;
  },
): Promise<TranscribeResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_key" };
  const host = ELEVENLABS_HOSTS[opts.region] ?? ELEVENLABS_HOSTS.global;

  let audio: Response;
  try {
    audio = await fetch(audioUrl, { cache: "no-store" });
  } catch (e) {
    return { ok: false, reason: "api_error", detail: `could not read our own audio: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!audio.ok) return { ok: false, reason: "api_error", detail: `could not read our own audio: HTTP ${audio.status}` };
  const bytes = new Uint8Array(await audio.arrayBuffer());
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  const channels = audioChannelCount(bytes) ?? 1;
  const splitChannels = opts.twoWay && channels >= 2;

  const form = new FormData();
  form.set("model_id", ELEVENLABS_MODEL);
  form.set(
    "file",
    new Blob([bytes], { type: audio.headers.get("content-type") || "application/octet-stream" }),
    "audio",
  );
  // One language pins it (the dictation chip); otherwise Scribe DETECTS —
  // Munr measured a constrained list making Gladia hear the wrong language.
  const langs = (opts.languages ?? []).filter(Boolean);
  if (langs.length === 1) form.set("language_code", langs[0]);
  form.set("timestamps_granularity", "word");
  form.set("tag_audio_events", "false");
  if (splitChannels) {
    form.set("use_multi_channel", "true");
    form.set("multichannel_output_style", "separate");
  } else if (opts.twoWay) {
    form.set("diarize", "true");
    form.set("num_speakers", "2");
  }
  for (const k of opts.keyterms
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && w.length <= 50 && w.split(/\s+/).length <= 5)
    .slice(0, 1000)) {
    form.append("keyterms", k);
  }

  let res: Response;
  try {
    res = await fetch(`${host}/v1/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal: AbortSignal.timeout(opts.timeoutMs ?? ELEVENLABS_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, reason: "timeout" };
    }
    return caught(e);
  }
  if (!res.ok) return httpDetail(res);
  const json = (await res.json().catch(() => null)) as (ScribeTranscript & { transcripts?: ScribeTranscript[] }) | null;
  if (!json) return { ok: false, reason: "api_error", detail: "invalid JSON response" };

  // One transcript per channel when split, else one for the file. Turns are
  // cut WITHIN a channel (voice change or a long pause) and then merged by
  // time — sorting words across channels first interleaves two voices word
  // by word where they overlap (Munr's live press, 2026-09-09).
  const transcripts: ScribeTranscript[] =
    Array.isArray(json.transcripts) && json.transcripts.length > 0 ? json.transcripts : [json];
  const speakerIds = new Map<string, number>();
  type Turn = { speaker: number; text: string[]; start: number; end: number; conf: number[] };
  const turns: Turn[] = [];
  const allConf: { confidence: number; weight: number }[] = [];
  const langCount = new Map<string, number>();
  transcripts.forEach((t, i) => {
    const lang = iso1(t.language_code);
    let current: Turn | null = null;
    for (const w of Array.isArray(t.words) ? t.words : []) {
      if ((typeof w?.type === "string" ? w.type : "word") !== "word") continue;
      const text = typeof w?.text === "string" ? w.text.trim() : "";
      if (!text) continue;
      const start = typeof w?.start === "number" ? w.start : 0;
      const end = typeof w?.end === "number" ? w.end : start;
      const conf = typeof w?.logprob === "number" ? Math.exp(Math.min(0, w.logprob)) : null;
      let speaker: number;
      if (splitChannels) {
        speaker = typeof w?.channel_index === "number" ? w.channel_index : typeof t.channel_index === "number" ? t.channel_index : i;
      } else {
        const id = typeof w?.speaker_id === "string" ? w.speaker_id : "0";
        if (!speakerIds.has(id)) speakerIds.set(id, speakerIds.size);
        speaker = speakerIds.get(id)!;
      }
      if (!current || current.speaker !== speaker || start - current.end > ELEVENLABS_TURN_GAP_SECONDS) {
        if (current) turns.push(current);
        current = { speaker, text: [], start, end, conf: [] };
      }
      current.text.push(text);
      current.end = end;
      if (conf !== null) {
        current.conf.push(conf);
        allConf.push({ confidence: conf, weight: 1 });
      }
      if (lang) langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
    }
    if (current) turns.push(current);
  });
  turns.sort((a, b) => a.start - b.start);

  const language =
    [...langCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? iso1(json.language_code);
  const confidence = aggregateConfidence(allConf);
  const joined = (t: Turn) => t.text.join(" ").replace(/\s+([,.!?;:])/g, "$1");

  if (opts.twoWay) {
    const dialogueTurns = turns.map((t) => ({ speaker: t.speaker, text: joined(t) }));
    if (new Set(dialogueTurns.map((t) => t.speaker)).size >= 2) {
      // Channel labels are facts only when the channel ORDER is a contract
      // (Twilio); a diarized split is always a guess.
      const trusted = splitChannels && opts.trustChannels;
      const dialogue = renderDialogue(dialogueTurns, trusted);
      if (dialogue) {
        return trusted
          ? { ok: true, text: dialogue, language, confidence }
          : { ok: true, text: dialogue, language, confidence, speakersInferred: true };
      }
    }
  }
  const flat =
    (typeof json.text === "string" && json.text.trim()) ||
    transcripts.map((t) => (typeof t.text === "string" ? t.text.trim() : "")).filter(Boolean).join("\n");
  if (!flat) return { ok: false, reason: "empty" };
  return { ok: true, text: flat, language, confidence };
}

async function transcribeViaAzure(
  audioUrl: string,
  region: string | null,
  twoWay = false,
  languages?: string[],
  trustChannels = true,
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
      locales: azureLocales(languages),
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
    const dialogue = renderDialogue(turns, trustChannels);
    if (dialogue) {
      return trustChannels
        ? { ok: true, text: dialogue, language, confidence }
        : { ok: true, text: dialogue, language, confidence, speakersInferred: true };
    }
  }

  if (!flat) return { ok: false, reason: "empty" };
  return { ok: true, text: flat, language, confidence };
}
