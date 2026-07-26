/**
 * Inbound-pipeline provider config — the single read path for which provider
 * runs each swappable capability (transcription / extraction / telephony) and
 * its non-secret params. Config lives in `app_settings` (admin-editable);
 * only the provider API keys live in env. See the config doctrine in
 * CLAUDE.md.
 *
 * A "provider" is an adapter behind a stable interface; the registries below
 * list the adapters that EXIST (one per capability today) plus the env
 * secret each one needs. Admin selects among registered adapters; when the
 * selected adapter's secret is missing, the UI blocks-with-reason (the
 * e-conomic pattern). Adding a provider = build its adapter + add a registry
 * entry — never a config-only switch to something unbuilt.
 *
 * Server-only: `inboundSecretStatus` reads process.env. Import from server
 * components / actions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProviderEntry = {
  /** Stored in app_settings; stable identifier. */
  key: string;
  /** Env vars this adapter requires (presence-checked, never read to the UI). */
  envSecrets: string[];
  /**
   * Transcription only: can this adapter transcribe a STEREO recording's
   * channels SEPARATELY? Twilio's dual-channel recording puts the caller on
   * channel 1 and us on channel 2 by contract, so a channel-capable provider
   * makes speaker attribution deterministic instead of a diarization guess
   * (docs/plan-live-call-recording.md). Verified from provider docs
   * 2026-07-23: Azure `channels:[0,1]` yes, Gladia no (diarization only).
   */
  supportsChannels?: boolean;
};

/** Registered transcription adapters (audio → text). */
export const TRANSCRIPTION_PROVIDERS: ProviderEntry[] = [
  // EU-native (French company, 100% EU residency) — the recommended default
  // after the 2026-07-15 re-eval; no region param needed.
  { key: "gladia", envSecrets: ["GLADIA_API_KEY"], supportsChannels: false },
  // US-parented but explicit EU regions; needs inbound_transcription_region.
  { key: "azure", envSecrets: ["AZURE_SPEECH_KEY"], supportsChannels: true },
];

/** Whether bridging is actually armed (mode chosen AND a number to ring). */
export function bridgingReady(settings: InboundSettings): boolean {
  return settings.callMode === "bridge" && !!settings.bridgeNumber;
}

/** Registered extraction adapters (text → structured who/what/intent). */
export const EXTRACTION_PROVIDERS: ProviderEntry[] = [
  { key: "anthropic", envSecrets: ["ANTHROPIC_API_KEY"] },
];

/**
 * Fallback model when `app_settings` carries none. One setting serves two
 * jobs — the single forced-tool extraction call AND the multi-turn command
 * agent (6 resolvers, up to 8 iterations) — so it is sized for the harder of
 * the two. Always a rolling ALIAS: a dated snapshot pins us to a model that
 * eventually retires. Discovery + the "Test" probe live in ./models.ts.
 */
export const DEFAULT_EXTRACTION_MODEL = "claude-sonnet-5";

/** Registered telephony adapters (phone number + recording webhook). */
export const TELEPHONY_PROVIDERS: ProviderEntry[] = [
  { key: "twilio", envSecrets: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"] },
];

/** How an incoming call is handled (docs/plan-live-call-recording.md). */
export type InboundCallMode = "voicemail" | "bridge";

export type InboundSettings = {
  transcriptionProvider: string;
  transcriptionRegion: string | null;
  /**
   * Adapter for two-way CALL recordings — split from the voicemail provider
   * because a dual-channel conversation wants per-channel (deterministic)
   * speaker attribution, which not every provider supports. Falls back to
   * transcriptionProvider when unset.
   */
  callTranscriptionProvider: string;
  /**
   * The stored value before the fallback is applied — NULL means "same as the
   * voicemail provider". The admin form needs the raw state so that choice
   * round-trips instead of hardening into an explicit pick on the next save.
   */
  callTranscriptionProviderRaw: string | null;
  extractionProvider: string;
  extractionModel: string;
  telephonyProvider: string;
  /** 'voicemail' (record a message) | 'bridge' (ring a phone, record the call). */
  callMode: InboundCallMode;
  /** E.164 phone rung in bridge mode. Bridging is inert without it. */
  bridgeNumber: string | null;
  bridgeTimeoutSeconds: number;
  /** The production number (+45) — announcements, SMS sender, print. */
  phoneNumber: string | null;
  /** The test number (Twilio trial) — webhook smoke-testing only. */
  phoneNumberTest: string | null;
  mediaRetentionDays: number;
  shadowMode: boolean;
};

const COLUMNS =
  "inbound_transcription_provider, inbound_transcription_region, inbound_extraction_provider, inbound_extraction_model, inbound_telephony_provider, inbound_phone_number, inbound_phone_number_test, inbound_media_retention_days, inbound_shadow_mode, inbound_call_mode, inbound_bridge_number, inbound_bridge_timeout_seconds, inbound_call_transcription_provider";

export async function loadInboundSettings(
  supabase: SupabaseClient,
): Promise<InboundSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select(COLUMNS)
    .eq("id", 1)
    .maybeSingle();
  const transcriptionProvider =
    data?.inbound_transcription_provider ?? "azure";
  return {
    transcriptionProvider,
    transcriptionRegion: data?.inbound_transcription_region ?? null,
    // Unset → the voicemail provider, so nothing changes until chosen.
    callTranscriptionProvider:
      data?.inbound_call_transcription_provider ?? transcriptionProvider,
    callTranscriptionProviderRaw:
      data?.inbound_call_transcription_provider ?? null,
    callMode: data?.inbound_call_mode === "bridge" ? "bridge" : "voicemail",
    bridgeNumber: data?.inbound_bridge_number?.trim() || null,
    bridgeTimeoutSeconds: Number(data?.inbound_bridge_timeout_seconds ?? 20),
    extractionProvider: data?.inbound_extraction_provider ?? "anthropic",
    // Drives BOTH the extraction call and the VC-1 command agent. A rolling
    // alias, never a dated snapshot — snapshots pin us and eventually retire.
    extractionModel: data?.inbound_extraction_model ?? DEFAULT_EXTRACTION_MODEL,
    telephonyProvider: data?.inbound_telephony_provider ?? "twilio",
    phoneNumber: data?.inbound_phone_number ?? null,
    phoneNumberTest: data?.inbound_phone_number_test ?? null,
    mediaRetentionDays: Number(data?.inbound_media_retention_days ?? 90),
    shadowMode: Boolean(data?.inbound_shadow_mode ?? true),
  };
}

/** Resolve a provider entry by key within a capability registry. */
export function findProvider(
  registry: ProviderEntry[],
  key: string,
): ProviderEntry | null {
  return registry.find((p) => p.key === key) ?? null;
}

export type SecretStatus = { envVar: string; present: boolean };

/**
 * SERVER-ONLY. Present/missing check for every env secret the currently
 * selected providers require — the value is never returned, only its
 * presence. Powers the admin card's ✓/✗ status and the pipeline's
 * blocked-with-reason guard.
 */
export function inboundSecretStatus(settings: InboundSettings): {
  transcription: SecretStatus[];
  extraction: SecretStatus[];
  telephony: SecretStatus[];
} {
  const check = (registry: ProviderEntry[], key: string): SecretStatus[] => {
    const entry = findProvider(registry, key);
    if (!entry) return [];
    return entry.envSecrets.map((envVar) => ({
      envVar,
      present: Boolean(process.env[envVar]),
    }));
  };
  return {
    transcription: check(
      TRANSCRIPTION_PROVIDERS,
      settings.transcriptionProvider,
    ),
    extraction: check(EXTRACTION_PROVIDERS, settings.extractionProvider),
    telephony: check(TELEPHONY_PROVIDERS, settings.telephonyProvider),
  };
}
