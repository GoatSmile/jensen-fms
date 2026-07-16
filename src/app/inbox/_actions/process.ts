"use server";

import { revalidatePath } from "next/cache";
import { getTranslations, getLocale } from "next-intl/server";

import { createServiceClient } from "@/lib/supabase/service";
import { parseExtraction } from "@/lib/inbound/extraction";
import { loadInboundSettings } from "@/lib/inbound/settings";
import {
  transcribeStage,
  extractStage,
  matchStage,
  runInboundPipeline,
  type StageResult,
} from "@/lib/inbound/pipeline";

export type ProcessResult = { ok: true } | { ok: false; error: string };

/**
 * Map a pipeline stage's stable failure `code` to a localized message. Shared
 * by every harness action so the wording stays in one place; the Twilio
 * webhook bypasses this and stores the raw code on `inbound_messages.error`.
 */
async function mapStageError(
  fail: Extract<StageResult, { ok: false }>,
): Promise<string> {
  const t = await getTranslations("errors");
  const { code, detail } = fail;
  switch (code) {
    case "not_found":
      return t("missingId");
    case "no_audio":
      return t("inboundNoAudio");
    case "no_body":
    case "extract.no_body":
      return t("inboundNoBody");
    case "no_extraction":
      return t("inboundNoExtraction");
    case "transcribe.no_key":
      return t("inboundTranscriptionKeyMissing");
    case "transcribe.no_region":
      return t("inboundTranscriptionRegionMissing");
    case "transcribe.timeout":
      return t("inboundTranscriptionTimeout");
    case "transcribe.empty":
      return t("inboundTranscriptionEmpty");
    case "transcribe.api_error":
      return t("inboundTranscriptionFailed", {
        detail: detail || t("inboundNoDetails"),
      });
    case "extract.no_key":
      return t("inboundExtractionKeyMissing");
    case "extract.api_error":
      return t("inboundExtractionFailed", {
        detail: detail || t("inboundNoDetails"),
      });
    case "transcribe.unknown_provider":
    case "extract.unknown_provider":
      return t("inboundUnknownProvider", { provider: detail ?? "" });
    default:
      return t("inboundCouldNotSave", {
        detail: detail ? `${code}: ${detail}` : code,
      });
  }
}

function done(messageId: string): ProcessResult {
  revalidatePath(`/inbox/${messageId}`);
  return { ok: true };
}

/**
 * Triage disposition (layer 5): the reviewer's override of the auto spam
 * suspicion. 'spam' folds it, 'not_spam' forces it back to the active queue,
 * 'pending' resets. Reversible; never destructive.
 */
export async function setDisposition(
  messageId: string,
  disposition: "pending" | "spam" | "not_spam",
): Promise<ProcessResult> {
  const t = await getTranslations("errors");
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("inbound_messages")
    .update({ disposition })
    .eq("id", messageId);
  if (error) {
    return { ok: false, error: t("inboundCouldNotSave", { detail: error.message }) };
  }
  revalidatePath("/inbox");
  return done(messageId);
}

/**
 * Harness ingress for Slice D: paste/edit the extraction JSON so matching can
 * be exercised before the extraction stage exists / to override it. Editing
 * extraction invalidates any prior match (clears candidates + attachments,
 * drops status back to `extracted`).
 */
export async function saveExtraction(
  messageId: string,
  jsonText: string,
): Promise<ProcessResult> {
  const t = await getTranslations("errors");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: t("inboundBadJson") };
  }
  const extraction = parseExtraction(parsed);

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("inbound_messages")
    .update({
      extraction,
      status: "extracted",
      match_candidates: null,
      matched_organization_id: null,
      matched_contact_id: null,
      matched_bike_id: null,
    })
    .eq("id", messageId);
  if (error) {
    return { ok: false, error: t("inboundCouldNotSave", { detail: error.message }) };
  }
  return done(messageId);
}

/**
 * Harness ingress for Slice C: save a transcript / message body so the pipeline
 * can be exercised on hand-typed text (or to override a real transcript).
 * Writes `body_text` + status `understood`; clearing it drops back to
 * `received`.
 */
export async function saveBodyText(
  messageId: string,
  text: string,
): Promise<ProcessResult> {
  const t = await getTranslations("errors");
  const body = text.trim();

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("inbound_messages")
    .update({
      body_text: body || null,
      status: body ? "understood" : "received",
    })
    .eq("id", messageId);
  if (error) {
    return { ok: false, error: t("inboundCouldNotSave", { detail: error.message }) };
  }
  return done(messageId);
}

/** Transcription stage (Slice B) — recording → body_text + language. */
export async function runTranscription(
  messageId: string,
): Promise<ProcessResult> {
  const supabase = createServiceClient();
  const settings = await loadInboundSettings(supabase);
  const r = await transcribeStage(supabase, messageId, settings);
  if (!r.ok) return { ok: false, error: await mapStageError(r) };
  return done(messageId);
}

/** Extraction stage (Slice C) — body_text → structured extraction. */
export async function runExtraction(messageId: string): Promise<ProcessResult> {
  const supabase = createServiceClient();
  const settings = await loadInboundSettings(supabase);
  const r = await extractStage(supabase, messageId, settings);
  if (!r.ok) return { ok: false, error: await mapStageError(r) };
  return done(messageId);
}

/** Match stage (Slice D) — deterministic; no model, no external keys. */
export async function runMatch(messageId: string): Promise<ProcessResult> {
  const supabase = createServiceClient();
  const locale = await getLocale();
  const r = await matchStage(supabase, messageId, locale);
  if (!r.ok) return { ok: false, error: await mapStageError(r) };
  return done(messageId);
}

/**
 * One-click pipeline: transcribe (when a recording is attached) → extract →
 * match. Stops at the first failure and stamps the message `failed` with the
 * reason (via the shared core, same path the Twilio webhook runs).
 */
export async function runPipeline(messageId: string): Promise<ProcessResult> {
  const supabase = createServiceClient();
  const locale = await getLocale();
  const r = await runInboundPipeline(supabase, messageId, locale);
  if (!r.ok) return { ok: false, error: await mapStageError(r) };
  return done(messageId);
}
