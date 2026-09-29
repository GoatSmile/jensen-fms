import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPhoneLines, readLineToken, type PhoneLine } from "@/lib/calls/lines";

import { runInboundPipeline } from "../pipeline";
import { CALL_IMPORT_PROVIDERS, findProvider, loadInboundSettings } from "../settings";
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

export type CallImportOutcome = {
  ok: boolean;
  /** Stable, for the caller to localize. */
  code: "off" | "no_lines" | "provider_error" | "done";
  summary: string;
  found: number;
  imported: number;
  failed: number;
  deferred: number;
  errors: string[];
};

type Work = { item: RecordedItem; line: PhoneLine; token: string };

/**
 * One import run (migration 112): for every phone line switched on, ask the
 * provider — with THAT line's token — what was recorded inside the lookback,
 * skip what is already here (channel_meta.external_id, unique), import the
 * rest stamped with the line and its person, and run the pipeline on each.
 *
 * Lines are grouped by token and each group is isolated: a missing or refused
 * token is reported against its own lines and the others still import. Safe
 * to run twice at once — a second insert of the same call loses on the unique
 * index and removes the audio it uploaded.
 */
export async function runCallImport(supabase: SupabaseClient): Promise<CallImportOutcome> {
  const base = { found: 0, imported: 0, failed: 0, deferred: 0, errors: [] as string[] };
  const settings = await loadInboundSettings(supabase);
  const provider = settings.callImportProvider;
  const adapter = callImportAdapter(provider);
  if (!adapter || !provider) {
    return { ...base, ok: true, code: "off", summary: "Call import is off." };
  }
  const lines = await loadPhoneLines(supabase, { provider, importingOnly: true });
  if (lines.length === 0) {
    return { ...base, ok: true, code: "no_lines", summary: "Call import is on, but no phone line is switched on." };
  }

  const since = new Date(Date.now() - settings.callImportLookbackHours * 3_600_000);
  const errors: string[] = [];
  const work: Work[] = [];
  const seen = new Set<string>();

  const groups = new Map<string, PhoneLine[]>();
  for (const l of lines) {
    const g = groups.get(l.token_env);
    if (g) g.push(l);
    else groups.set(l.token_env, [l]);
  }
  for (const [env, group] of groups) {
    const names = group.map((l) => l.endpoint_name ?? l.endpoint).join(", ");
    const token = readLineToken(group[0]);
    if (!token) {
      errors.push(`${env} is not set — ${names} not imported`);
      continue;
    }
    const byEndpoint = new Map(group.map((l) => [l.endpoint, l]));
    const listed = await adapter.listRecorded(token, {
      since,
      endpoints: [...byEndpoint.keys()],
      voicemails: settings.callImportVoicemails,
    });
    if (!listed.ok) {
      errors.push(`${names}: ${listed.error}`);
      continue;
    }
    for (const item of listed.value) {
      const line = byEndpoint.get(item.endpoint);
      if (!line || seen.has(item.externalId)) continue;
      seen.add(item.externalId);
      work.push({ item, line, token });
    }
  }

  if (work.length === 0 && errors.length > 0 && errors.length === groups.size) {
    return { ...base, ok: false, code: "provider_error", summary: errors.join("; "), errors };
  }

  const known = new Set<string>();
  if (work.length > 0) {
    const { data, error } = await supabase
      .from("inbound_messages")
      .select("channel_meta->>external_id")
      .in(
        "channel_meta->>external_id",
        work.map((w) => w.item.externalId),
      );
    if (error) {
      return { ...base, ok: false, code: "provider_error", summary: error.message, errors: [error.message] };
    }
    for (const row of (data ?? []) as { external_id: string | null }[]) {
      if (row.external_id) known.add(row.external_id);
    }
  }
  // Oldest first, so the list fills in the order the calls happened.
  const fresh = work
    .filter((w) => !known.has(w.item.externalId))
    .sort((a, b) => a.item.startedAt.localeCompare(b.item.startedAt));
  const batch = fresh.slice(0, MAX_NEW_PER_RUN);

  const importedIds: string[] = [];
  for (const w of batch) {
    const r = await importOne(supabase, adapter, w);
    if (r.ok) {
      if (r.id) importedIds.push(r.id);
    } else {
      errors.push(`${w.item.externalId}: ${r.error}`);
    }
  }

  // Side by side: transcription is the slow part and it is the provider's
  // wait, not ours. Each pipeline stamps its own failure on its row, where
  // the Calls page shows it and "Run whole pipeline" retries it.
  await Promise.allSettled(importedIds.map((id) => runInboundPipeline(supabase, id, "da")));

  const deferred = fresh.length - batch.length;
  return {
    ok: errors.length === 0,
    code: "done",
    found: work.length,
    imported: importedIds.length,
    failed: errors.length,
    deferred,
    errors,
    summary:
      `${work.length} recorded on ${lines.length} line(s) in the last ${settings.callImportLookbackHours} h; ` +
      `${importedIds.length} imported, ${known.size} already here` +
      `${errors.length ? `; ${errors.length} problem(s): ${errors.join("; ")}` : ""}` +
      `${deferred ? `; ${deferred} left for the next run` : ""}.`,
  };
}

async function importOne(
  supabase: SupabaseClient,
  adapter: CallImportAdapter,
  { item, line, token }: Work,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const audio = await adapter.fetchAudio(token, item);
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
      // Stamped once, never re-derived: re-mapping the line later must not
      // move this call to someone else (migration 112).
      phone_line_id: line.id,
      handled_by_person_id: line.person_id,
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
