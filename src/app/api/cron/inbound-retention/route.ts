import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
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

  return NextResponse.json({
    ok: true,
    removed,
    cutoff,
    retentionDays: mediaRetentionDays,
  });
}
