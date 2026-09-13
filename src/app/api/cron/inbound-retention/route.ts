import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { DICTATION_PREFIX } from "@/lib/dictation/storage";
import { loadInboundSettings } from "@/lib/inbound/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "inbound";

/**
 * Inbound media retention (Slice F, GDPR). Deletes voicemail AUDIO older than
 * `inbound_media_retention_days` (default 90) while KEEPING the transcript +
 * extraction on the row — audio is the sensitive artifact, the ticket-facing
 * text stays. The obligation starts once real customer audio exists, which is
 * why this lands with the telephony slice.
 *
 * Auth mirrors the FX cron: Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
 * Fail-closed on Vercel if the secret is unset; callable locally without one.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const isVercel = Boolean(process.env.VERCEL);

  if (!expected) {
    if (isVercel) {
      return NextResponse.json(
        { ok: false, error: "CRON_SECRET not configured" },
        { status: 503 },
      );
    }
    // Local dev — allow through.
  } else if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { mediaRetentionDays } = await loadInboundSettings(supabase);
  const cutoff = new Date(
    Date.now() - mediaRetentionDays * 86_400_000,
  ).toISOString();

  const { data: stale, error } = await supabase
    .from("inbound_messages")
    .select("id, media_path")
    .not("media_path", "is", null)
    .lt("received_at", cutoff);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let removed = 0;
  for (const row of stale ?? []) {
    if (row.media_path) {
      await supabase.storage.from(BUCKET).remove([row.media_path]);
    }
    await supabase
      .from("inbound_messages")
      .update({ media_path: null, media_mime_type: null })
      .eq("id", row.id);
    removed += 1;
  }

  const strayDictations = await sweepStrayDictations(supabase);

  return NextResponse.json({
    ok: true,
    removed,
    strayDictations,
    cutoff,
    retentionDays: mediaRetentionDays,
  });
}

/** A dictation's audio is deleted as soon as its text comes back, so anything
 *  still here is the crash case — no row references it and nothing else walks
 *  this prefix. An hour is already far longer than the transcription takes;
 *  24 h is the generous version of "nobody is coming back for it". */
const STRAY_DICTATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function sweepStrayDictations(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(DICTATION_PREFIX, { limit: 1000 });
  if (error || !data?.length) return 0;

  const threshold = Date.now() - STRAY_DICTATION_MAX_AGE_MS;
  const stale = data
    .filter((o) => {
      const at = Date.parse(o.created_at ?? "");
      return Number.isFinite(at) && at < threshold;
    })
    .map((o) => `${DICTATION_PREFIX}/${o.name}`);
  if (stale.length === 0) return 0;

  const { error: removeErr } = await supabase.storage
    .from(BUCKET)
    .remove(stale);
  return removeErr ? 0 : stale.length;
}
