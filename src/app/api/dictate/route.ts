import { NextResponse } from "next/server";

import { readGate } from "@/lib/auth/read-session";
import {
  INBOUND_BUCKET,
  isDictationPath,
} from "@/lib/dictation/storage";
import { transcriptionSecretsPresent } from "@/lib/dictation/ready";
import { loadInboundSettings } from "@/lib/inbound/settings";
import { isWorkshopLanguage, transcribeAudio, type TranscribeResult } from "@/lib/inbound/transcribe";
import { loadTranscriptionKeyterms } from "@/lib/inbound/keyterms";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
/** Same window the Twilio recording callback takes; see POLL_BUDGET_MS below. */
export const maxDuration = 60;

/** The provider fetches the audio within seconds; keep the window tight. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Poll budget, deliberately UNDER `maxDuration`. A platform timeout kills the
 * request with no body, so the browser sees a network error it cannot explain;
 * returning a clean `timeout` with a few seconds to spare lets the UI say what
 * happened and offer Retry on audio it still holds.
 */
const POLL_BUDGET_MS = 45_000;

/**
 * A spoken request to the secretary that has not come back in this long gets
 * a SECOND attempt beside the first, and whichever answers first wins
 * (2026-10-22: a benchmark caught one transcription stalling 34 s, where they
 * normally take 1–2 s). Only for the secretary (`hedge`), whose recordings
 * are short; a three-minute dictation can rightly take longer.
 */
const HEDGE_AFTER_MS = 8_000;

/** `attempt` once; again beside it after `afterMs` if it is still running. A failure waits for the other. */
function hedged(attempt: (timeoutMs: number) => Promise<TranscribeResult>, afterMs: number): Promise<TranscribeResult> {
  return new Promise((resolve) => {
    let running = 1;
    let settled = false;
    const finish = (r: TranscribeResult) => {
      if (settled) return;
      running--;
      if (r.ok || running === 0) {
        settled = true;
        clearTimeout(timer);
        resolve(r);
      }
    };
    const start = (timeoutMs: number) => {
      attempt(timeoutMs).then(finish, (e: unknown) =>
        finish({ ok: false, reason: "api_error", detail: e instanceof Error ? e.message : String(e) }),
      );
    };
    const timer = setTimeout(() => {
      if (settled) return;
      running++;
      console.warn(`[dictate] no transcript after ${afterMs} ms — a second attempt beside the first`);
      start(POLL_BUDGET_MS - afterMs);
    }, afterMs);
    start(POLL_BUDGET_MS);
  });
}

/**
 * Stage 2 of a dictation: transcribe the uploaded audio and throw it away.
 *
 * A route handler rather than a server action for two reasons: `maxDuration`
 * can only be set at a route, and an async provider's poll can outlive a
 * platform default; and one endpoint serves both dictation surfaces. Middleware
 * skips /api (see src/middleware.ts), so this authenticates itself.
 *
 * The audio is deleted in a `finally` — success, provider failure or crash. The
 * retention cron sweeps anything a hard crash leaves behind, because nothing
 * else walks this prefix.
 */
export async function POST(request: Request) {
  const gate = await readGate();
  if (gate.kind === "anonymous") {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    path?: unknown;
    language?: unknown;
    hedge?: unknown;
  } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  if (!isDictationPath(path)) {
    return NextResponse.json({ ok: false, reason: "bad_path" }, { status: 400 });
  }
  // The person's own language (or the document's): NOT a pin. Detection runs
  // first (owner, 2026-10-08: no language toggle); this is the retry's pin when
  // detection lands outside the workshop's languages. Anything else is ignored.
  const fallback =
    body?.language === "da" || body?.language === "en" ? body.language : null;

  const supabase = createServiceClient();
  try {
    const settings = await loadInboundSettings(supabase);
    if (!transcriptionSecretsPresent(settings)) {
      return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
    }

    const { data: signed, error } = await supabase.storage
      .from(INBOUND_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !signed?.signedUrl) {
      return NextResponse.json({ ok: false, reason: "api_error" }, { status: 500 });
    }

    const keyterms = await loadTranscriptionKeyterms(supabase);
    const once = (languages: string[] | undefined, timeoutMs: number) =>
      transcribeAudio(signed.signedUrl, {
        provider: settings.transcriptionProvider,
        region: settings.transcriptionRegion,
        languages,
        timeoutMs,
        elevenlabsRegion: settings.elevenlabsRegion,
        keyterms,
      });
    const run = (languages?: string[]) =>
      body?.hedge === true ? hedged((ms) => once(languages, ms), HEDGE_AFTER_MS) : once(languages, POLL_BUDGET_MS);
    let result = await run();
    let pinned = false;
    if (result.ok && fallback && !isWorkshopLanguage(result.language)) {
      result = await run([fallback]);
      pinned = true;
    }

    if (!result.ok) {
      // The reason is the UI's message key; `detail` is for the server log only
      // — it carries the provider's own words, which are not the tech's problem.
      if (result.detail) {
        console.error(`[dictate] ${result.reason}: ${result.detail}`);
      }
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 502 });
    }
    // The language HEARD, so the secretary can answer in it (Dennis,
    // 2026-10-21). A pinned retry heard the fallback by construction; a
    // detection outside the workshop's languages says nothing.
    const heard = pinned ? fallback : isWorkshopLanguage(result.language) ? result.language : null;
    return NextResponse.json({ ok: true, text: result.text, language: heard });
  } finally {
    // Best-effort: a failed delete must never turn a good transcript into an
    // error. The cron sweep is the backstop.
    try {
      await supabase.storage.from(INBOUND_BUCKET).remove([path]);
    } catch {
      /* swept later */
    }
  }
}
