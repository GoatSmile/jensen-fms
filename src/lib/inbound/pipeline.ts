/**
 * Inbound pipeline core — the transcribe → extract → match orchestration and
 * its per-stage DB writes, in ONE place so the two callers can't drift:
 *   - the harness server actions (src/app/inbox/_actions/process.ts), which
 *     wrap each stage with i18n error mapping + revalidate, and
 *   - the Twilio webhook (Slice F), which runs the whole pipeline after a
 *     real voicemail lands and writes failures onto inbound_messages.error.
 *
 * Channel-blind: everything here reads only the normalized fields
 * (`media_path`, `body_text`, `from_identity`, `extraction`). Stage failures
 * are returned as a stable `code` (+ optional raw `detail`) that the action
 * layer maps to a localized string; the webhook stores it verbatim.
 *
 * Server-only. Import from server actions / route handlers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { parseExtraction } from "./extraction";
import { extractInbound } from "./extract";
import { matchInbound } from "./match";
import { transcribeVoicemail } from "./channels/voicemail";
import { loadInboundSettings, type InboundSettings } from "./settings";

export type StageResult =
  | { ok: true }
  | { ok: false; code: string; detail?: string };

/**
 * Transcribe the message's recording and write body_text + language,
 * advancing to `understood` and clearing everything downstream (a fresh
 * transcript invalidates prior extraction + match).
 */
export async function transcribeStage(
  supabase: SupabaseClient,
  messageId: string,
  settings: InboundSettings,
): Promise<StageResult> {
  const { data: msg, error } = await supabase
    .from("inbound_messages")
    .select("id, media_path")
    .eq("id", messageId)
    .maybeSingle();
  if (error) return { ok: false, code: "save", detail: error.message };
  if (!msg) return { ok: false, code: "not_found" };
  if (!msg.media_path) return { ok: false, code: "no_audio" };

  const result = await transcribeVoicemail(supabase, msg.media_path, settings);
  if (!result.ok) {
    return { ok: false, code: `transcribe.${result.reason}`, detail: result.detail };
  }

  const { error: saveErr } = await supabase
    .from("inbound_messages")
    .update({
      body_text: result.text,
      language: result.language,
      status: "understood",
      extraction: null,
      match_candidates: null,
      matched_organization_id: null,
      matched_contact_id: null,
      matched_bike_id: null,
      error: null,
    })
    .eq("id", messageId);
  if (saveErr) return { ok: false, code: "save", detail: saveErr.message };
  return { ok: true };
}

/**
 * Run the extraction provider over body_text, store the structured
 * extraction, advance to `extracted`, and clear any prior match.
 */
export async function extractStage(
  supabase: SupabaseClient,
  messageId: string,
  settings: InboundSettings,
): Promise<StageResult> {
  const { data: msg, error } = await supabase
    .from("inbound_messages")
    .select("id, body_text")
    .eq("id", messageId)
    .maybeSingle();
  if (error) return { ok: false, code: "save", detail: error.message };
  if (!msg) return { ok: false, code: "not_found" };

  const result = await extractInbound(msg.body_text, {
    provider: settings.extractionProvider,
    model: settings.extractionModel,
  });
  if (!result.ok) {
    return { ok: false, code: `extract.${result.reason}`, detail: result.detail };
  }

  const { error: saveErr } = await supabase
    .from("inbound_messages")
    .update({
      extraction: result.extraction,
      status: "extracted",
      match_candidates: null,
      matched_organization_id: null,
      matched_contact_id: null,
      matched_bike_id: null,
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", messageId);
  if (saveErr) return { ok: false, code: "save", detail: saveErr.message };
  return { ok: true };
}

/**
 * Deterministic match over extraction + sender identity; store candidates +
 * any exactly-one attachments, advance to `matched`. `locale` only affects
 * the display names stored in the candidate lists.
 */
export async function matchStage(
  supabase: SupabaseClient,
  messageId: string,
  locale: string,
): Promise<StageResult> {
  const { data: msg, error } = await supabase
    .from("inbound_messages")
    .select("id, from_identity, extraction")
    .eq("id", messageId)
    .maybeSingle();
  if (error) return { ok: false, code: "save", detail: error.message };
  if (!msg) return { ok: false, code: "not_found" };
  if (!msg.extraction) return { ok: false, code: "no_extraction" };

  const result = await matchInbound(
    supabase,
    {
      fromIdentity: msg.from_identity,
      extraction: parseExtraction(msg.extraction),
    },
    locale,
  );

  const { error: saveErr } = await supabase
    .from("inbound_messages")
    .update({
      match_candidates: result.candidates,
      matched_organization_id: result.matchedOrganizationId,
      matched_contact_id: result.matchedContactId,
      matched_bike_id: result.matchedBikeId,
      status: "matched",
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", messageId);
  if (saveErr) return { ok: false, code: "save", detail: saveErr.message };
  return { ok: true };
}

/**
 * Full pipeline: transcribe (when a recording is attached) → extract → match.
 * Stops at the first failure. On failure the message is stamped `failed` with
 * the reason on `error` so it surfaces in the review UI (and a human / the
 * "Run whole pipeline" button can retry). Returns the failing stage result.
 *
 * `hasBody` short-circuits the "nothing to work with" case for hand-typed
 * messages with no recording.
 */
export async function runInboundPipeline(
  supabase: SupabaseClient,
  messageId: string,
  locale: string,
): Promise<StageResult> {
  const { data: msg, error } = await supabase
    .from("inbound_messages")
    .select("id, media_path, body_text")
    .eq("id", messageId)
    .maybeSingle();
  if (error) return fail(supabase, messageId, { ok: false, code: "save", detail: error.message });
  if (!msg) return { ok: false, code: "not_found" };

  if (msg.media_path) {
    const tr = await transcribeStage(supabase, messageId, await loadInboundSettings(supabase));
    if (!tr.ok) return fail(supabase, messageId, tr);
  } else if (!msg.body_text?.trim()) {
    return fail(supabase, messageId, { ok: false, code: "no_body" });
  }

  const ex = await extractStage(
    supabase,
    messageId,
    await loadInboundSettings(supabase),
  );
  if (!ex.ok) return fail(supabase, messageId, ex);

  const mt = await matchStage(supabase, messageId, locale);
  if (!mt.ok) return fail(supabase, messageId, mt);
  return { ok: true };
}

/** Stamp a pipeline failure onto the message so the reviewer sees why. */
async function fail(
  supabase: SupabaseClient,
  messageId: string,
  result: Extract<StageResult, { ok: false }>,
): Promise<StageResult> {
  if (result.code !== "not_found") {
    await supabase
      .from("inbound_messages")
      .update({
        status: "failed",
        error: result.detail ? `${result.code}: ${result.detail}` : result.code,
      })
      .eq("id", messageId);
  }
  return result;
}
