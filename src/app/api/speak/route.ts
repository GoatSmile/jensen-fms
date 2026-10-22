import { readGate, readPersonId } from "@/lib/auth/read-session";
import { parseAssistantAnswer } from "@/lib/assistant/answer";
import { mayReadCommand, readCallsScope } from "@/lib/calls/access";
import { loadInboundSettings } from "@/lib/inbound/settings";
import { streamElevenLabs } from "@/lib/speech/elevenlabs";
import { synthesizeGoogle } from "@/lib/speech/google";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/** The longest answer read aloud — the same cap as `speakAnswer`. */
const MAX_CHARS = 1500;

/**
 * A secretary reply as SPEECH, streamed — an `<audio>` element's source, so
 * the first words play while ElevenLabs is still making the rest (owner,
 * 2026-10-22; the whole-file path waited for every byte first).
 *
 * The text is never in the URL: `m` names the request (a kind='command' row)
 * and its stored answer is what is read, under the same rule as the panel
 * (`mayReadCommand` — the asker, or `inbox`). Middleware skips /api, so this
 * authenticates itself. Google's voice has no stream, so it comes whole.
 * Any refusal is a bare status: the player then falls back to `speakAnswer`
 * and the browser's own voice (use-speaker.ts).
 */
export async function GET(request: Request) {
  const gate = await readGate();
  if (gate.kind === "anonymous") return new Response(null, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("m") ?? "";
  const lang = url.searchParams.get("lang") === "en" ? "en" : "da";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 400 });

  const supabase = createServiceClient();
  const { data: msg } = await supabase
    .from("inbound_messages")
    .select("id, kind, commanded_by, assistant_answer")
    .eq("id", id)
    .maybeSingle();
  if (!msg || msg.kind !== "command") return new Response(null, { status: 404 });
  if (!mayReadCommand(await readCallsScope(), await readPersonId(), msg)) return new Response(null, { status: 404 });
  const text = (parseAssistantAnswer(msg.assistant_answer)?.text ?? "").trim().slice(0, MAX_CHARS);
  if (!text) return new Response(null, { status: 404 });

  const s = await loadInboundSettings(supabase);
  const headers = { "content-type": "audio/mpeg", "cache-control": "private, no-store" };
  if (s.speechProvider === "google") {
    const r = await synthesizeGoogle(text, lang);
    if (!r.ok) return new Response(null, { status: r.reason === "unavailable" ? 503 : 502 });
    return new Response(Buffer.from(r.base64, "base64"), { headers });
  }
  const r = await streamElevenLabs(text, lang, {
    model: s.speechElevenlabsModel,
    voiceId: lang === "da" ? s.speechElevenlabsVoiceDa : s.speechElevenlabsVoiceEn,
  });
  if (!r.ok) {
    if (r.reason === "error") console.error("[speak]", r.detail);
    return new Response(null, { status: r.reason === "unavailable" ? 503 : 502 });
  }
  return new Response(r.stream, { headers });
}
