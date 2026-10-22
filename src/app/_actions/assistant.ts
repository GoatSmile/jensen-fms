"use server";

import { headers } from "next/headers";

import { readPersonId } from "@/lib/auth/read-session";
import { buildAssistantView, COMMAND_VIEW_COLUMNS, type AssistantView, type CommandRow } from "@/lib/assistant/view";
import { mayReadCommand, readCallsScope } from "@/lib/calls/access";
import { createServiceClient } from "@/lib/supabase/service";

export type { AssistantView } from "@/lib/assistant/view";

/**
 * One request, as the floating panel shows it: the answer, the drafted
 * actions and what their cards need. The same access rule as /commands —
 * the asker, or `inbox` (`mayReadCommand`) — because the service client
 * reads past RLS.
 */
export async function loadAssistantView(id: string): Promise<AssistantView> {
  const supabase = createServiceClient();
  const { data: msg } = await supabase.from("inbound_messages").select(COMMAND_VIEW_COLUMNS).eq("id", id).maybeSingle();
  if (!msg || msg.kind !== "command") return { ok: false };
  if (!mayReadCommand(await readCallsScope(), await readPersonId(), msg)) return { ok: false };
  return buildAssistantView(supabase, msg as CommandRow);
}

/** What the phone measured for one spoken turn, in milliseconds. */
export type SecretaryClientTimings = {
  /** Upload + transcription of the recording (after the pause ended it). */
  transcribeMs?: number;
  /** The request round trip: the answer, drafted and carried out. */
  requestMs?: number;
  /** A streamed reply: from sending the request to its first sentence arriving. */
  firstSentenceMs?: number;
  /** From the text being there (the answer, or a streamed reply's first sentence) to the first sound. */
  voiceMs?: number;
  /** From the recording ending to the first sound — what the person waits. */
  totalMs?: number;
  /** How the reply was voiced: sentence by sentence as written, streamed, whole file, or the browser's own voice. */
  voice?: "sentences" | "stream" | "file" | "browser";
};

/**
 * Keep the phone's half of a turn's timing beside the server's
 * (`assistant_answer.timings`), so "how long does the secretary take" is a
 * query, not a benchmark (2026-10-22). Only the asker's own request;
 * best-effort, never throws.
 */
export async function recordSecretaryTimings(id: string, t: SecretaryClientTimings): Promise<void> {
  try {
    const me = await readPersonId();
    if (!me || typeof id !== "string") return;
    const supabase = createServiceClient();
    const { data: msg } = await supabase.from("inbound_messages").select("kind, commanded_by, assistant_answer").eq("id", id).maybeSingle();
    if (!msg || msg.kind !== "command" || msg.commanded_by !== me) return;
    const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 600_000 ? Math.round(v) : undefined);
    const clean = {
      transcribeMs: ms(t?.transcribeMs),
      requestMs: ms(t?.requestMs),
      firstSentenceMs: ms(t?.firstSentenceMs),
      voiceMs: ms(t?.voiceMs),
      totalMs: ms(t?.totalMs),
      voice: t?.voice === "sentences" || t?.voice === "stream" || t?.voice === "file" || t?.voice === "browser" ? t.voice : undefined,
      // Which phone and browser — the two families differ (Android/iPhone).
      userAgent: ((await headers()).get("user-agent") ?? "").slice(0, 200) || undefined,
    };
    const answer = (msg.assistant_answer ?? {}) as Record<string, unknown>;
    await supabase
      .from("inbound_messages")
      .update({ assistant_answer: { ...answer, client_timings: clean } })
      .eq("id", id);
  } catch {
    /* timing is never worth an error */
  }
}
