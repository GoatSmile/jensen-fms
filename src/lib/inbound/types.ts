/**
 * Generic inbound trunk — shared types (2026-07-14 decision, see
 * docs/plan-july9-vacation-month.md → "generic inbound trunk").
 *
 * `inbound_messages` is channel-agnostic: voicemail is the first channel,
 * email / WhatsApp / agent-API ingress are future adapters. The pipeline
 * (transcribe/extract/match, Slices B–D) reads ONLY the normalized fields
 * (`from_identity`, `body_text`) so it never learns the channel. Anything
 * channel-shaped lives in `channel_meta`.
 */
import type { Database } from "@/lib/types/database";

export type InboundChannel = Database["public"]["Enums"]["inbound_channel"];
export type InboundStatus = Database["public"]["Enums"]["inbound_status"];
export type InboundMessageRow =
  Database["public"]["Tables"]["inbound_messages"]["Row"];

/**
 * The pipeline's forward progression. Used to render a stage strip and to
 * decide what "review me" surfaces show — NOT for language (labels live in
 * the `inboundStatus` message namespace). `failed` sits outside the order.
 */
export const INBOUND_STATUS_ORDER: InboundStatus[] = [
  "received",
  "understood",
  "extracted",
  "matched",
  "actioned",
];

/** Badge variant per status — presentation, not language. */
export const INBOUND_STATUS_VARIANT: Record<
  InboundStatus,
  "outline" | "secondary" | "success" | "destructive"
> = {
  received: "outline",
  understood: "secondary",
  extracted: "secondary",
  matched: "secondary",
  actioned: "success",
  failed: "destructive",
};

/**
 * Channel-shaped metadata we stash on `channel_meta`. Loosely typed — each
 * channel adapter owns its own keys; only the harness-upload keys are known
 * today. Never read by the channel-blind pipeline.
 */
export type VoicemailChannelMeta = {
  original_filename?: string;
  size_bytes?: number;
  source?: "harness_upload" | "twilio";
  // Twilio voicemail (Slice F). The recording is pulled into Supabase EU and
  // deleted from Twilio at webhook time; these are the identifiers + audit.
  twilio_call_sid?: string;
  twilio_recording_sid?: string;
  twilio_recording_seconds?: number;
  to_number?: string;
  /** Whether the copy on Twilio was successfully deleted after fetch. */
  twilio_deleted?: boolean;
};
