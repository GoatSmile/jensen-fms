import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runInboundPipeline } from "../pipeline";
import {
  CALL_IMPORT_PROVIDERS,
  findProvider,
  loadInboundSettings,
} from "../settings";
import type { VoicemailChannelMeta } from "../types";
import { relatelAdapter } from "./relatel";
import type { CallImportAdapter, RecordedItem } from "./types";

const BUCKET = "inbound";
/**
 * New items handled per run. Each one's pipeline waits on transcription (up
 * to ~90 s), and they run side by side, so this bounds one run's wall-clock;
 * anything beyond it is picked up by the next run, five minutes later.
 */
const MAX_NEW_PER_RUN = 6;

/** Built adapters by registry key — a key here without an entry in
 *  CALL_IMPORT_PROVIDERS (or the reverse) is a bug, not config. */
const ADAPTERS: Record<string, CallImportAdapter> = {
  relatel: relatelAdapter,
};

export function callImportAdapter(key: string | null): CallImportAdapter | null {
  if (!key || !findProvider(CALL_IMPORT_PROVIDERS, key)) return null;
  return ADAPTERS[key] ?? null;
}

/** Env secrets the adapter needs that are not set — names only. */
export function missingCallImportSecrets(key: string): string[] {
  const entry = findProvider(CALL_IMPORT_PROVIDERS, key);
  return (entry?.envSecrets ?? []).filter((v) => !process.env[v]);
}

export type CallImportOutcome = {
  ok: boolean;
  /** Stable, for the caller to localize. */
  code:
    | "off"
    | "missing_secret"
    | "no_endpoints"
    | "provider_error"
    | "done";
  summary: string;
  found: number;
  imported: number;
  failed: number;
  deferred: number;
  errors: string[];
};

/**
 * One import run: list what the provider recorded inside the lookback window,
 * skip what is already here (channel_meta.external_id, unique — migration
 * 111), import the rest and run the pipeline on each. Safe to run twice at
 * once: a second insert of the same call loses on the unique index and
 * removes the audio it uploaded.
 */
export async function runCallImport(
  supabase: SupabaseClient,
): Promise<CallImportOutcome> {
  const base = { found: 0, imported: 0, failed: 0, deferred: 0, errors: [] as string[] };
  const settings = await loadInboundSettings(supabase);
  const adapter = callImportAdapter(settings.callImportProvider);
  if (!adapter || !settings.callImportProvider) {
    return { ...base, ok: true, code: "off", summary: "Call import is off." };
  }
  const missing = missingCallImportSecrets(settings.callImportProvider);
  if (missing.length > 0) {
    return {
      ...base,
      ok: false,
      code: "missing_secret",
      summary: `Call import is on, but ${missing.join(", ")} is not set.`,
    };
  }
  if (settings.callImportEndpoints.length === 0) {
    return {
      ...base,
      ok: true,
      code: "no_endpoints",
      summary: "Call import is on, but nobody is selected.",
    };
  }

  const since = new Date(Date.now() - settings.callImportLookbackHours * 3_600_000);
  const listed = await adapter.listRecorded({
    since,
    endpoints: settings.callImportEndpoints,
    voicemails: settings.callImportVoicemails,
  });
  if (!listed.ok) {
    return { ...base, ok: false, code: "provider_error", summary: listed.error, errors: [listed.error] };
  }

  const items = listed.value;
  const known = new Set<string>();
  if (items.length > 0) {
    const { data, error } = await supabase
      .from("inbound_messages")
      .select("channel_meta->>external_id")
      .in(
        "channel_meta->>external_id",
        items.map((i) => i.externalId),
      );
    if (error) {
      return { ...base, ok: false, code: "provider_error", summary: error.message, errors: [error.message] };
    }
    for (const row of (data ?? []) as { external_id: string | null }[]) {
      if (row.external_id) known.add(row.external_id);
    }
  }
  const fresh = items.filter((i) => !known.has(i.externalId));
  const batch = fresh.slice(0, MAX_NEW_PER_RUN);

  const errors: string[] = [];
  const importedIds: string[] = [];
  for (const item of batch) {
    const r = await importOne(supabase, adapter, item);
    if (r.ok) {
      if (r.id) importedIds.push(r.id);
    } else {
      errors.push(`${item.externalId}: ${r.error}`);
    }
  }

  // Side by side: transcription is the slow part and it is the provider's
  // wait, not ours. Each pipeline stamps its own failure on its row, where
  // the inbox shows it and "Run whole pipeline" retries it.
  await Promise.allSettled(
    importedIds.map((id) => runInboundPipeline(supabase, id, "da")),
  );

  const deferred = fresh.length - batch.length;
  return {
    ok: errors.length === 0,
    code: "done",
    found: items.length,
    imported: importedIds.length,
    failed: errors.length,
    deferred,
    errors,
    summary:
      `${items.length} recorded in the last ${settings.callImportLookbackHours} h; ` +
      `${importedIds.length} imported, ${known.size} already here` +
      `${errors.length ? `, ${errors.length} failed` : ""}` +
      `${deferred ? `, ${deferred} left for the next run` : ""}.`,
  };
}

async function importOne(
  supabase: SupabaseClient,
  adapter: CallImportAdapter,
  item: RecordedItem,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const audio = await adapter.fetchAudio(item);
  if (!audio.ok) return audio;

  const folder = item.kind === "call" ? "call" : "voicemail";
  const objectPath = `${folder}/${crypto.randomUUID()}.mp3`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, audio.value.bytes, {
      contentType: audio.value.mime,
      upsert: false,
    });
  if (uploadErr) return { ok: false, error: `storage: ${uploadErr.message}` };

  const meta: VoicemailChannelMeta = {
    source: "relatel",
    external_id: item.externalId,
    call_direction: item.direction,
    call_endpoint: item.endpoint,
    call_endpoint_name: item.endpointName ?? undefined,
    call_mode: item.kind === "call" ? "bridged" : "voicemail",
    recording_channels: 1,
  };
  const { data, error } = await supabase
    .from("inbound_messages")
    .insert({
      channel: item.kind === "call" ? "phone_call" : "voicemail",
      status: "received",
      from_identity: item.remoteNumber,
      received_at: item.startedAt,
      duration_seconds: item.durationSeconds,
      call_outcome: item.kind === "call" ? "answered" : "message_left",
      media_path: objectPath,
      media_mime_type: audio.value.mime,
      channel_meta: meta,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    // Most likely a parallel run imported it first (unique external_id):
    // drop our copy of the audio so it does not sit outside retention.
    await supabase.storage.from(BUCKET).remove([objectPath]);
    if (error?.code === "23505") return { ok: true, id: null };
    return { ok: false, error: error?.message ?? "insert returned no row" };
  }
  return { ok: true, id: data.id };
}
