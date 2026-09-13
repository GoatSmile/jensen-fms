"use server";

import { readGate } from "@/lib/auth/read-session";
import {
  DICTATION_PREFIX,
  INBOUND_BUCKET,
  dictationObjectPath,
} from "@/lib/dictation/storage";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Stage 1 of a dictation: mint a one-shot signed URL the BROWSER uploads to
 * directly.
 *
 * The bytes never ride a server action or an API route of ours — a 3-minute
 * 16 kHz WAV is ~5.7 MB and would trip Vercel's 4.5 MB request cap (and a
 * server action's own 1 MB body limit long before that). Two-stage upload, same
 * pattern as Munin's `createSurpriseUploadUrl`: sign here, PUT from the client,
 * then hand only the PATH to /api/dictate.
 *
 * The bucket is private and the path is minted server-side, so the client never
 * chooses where it writes — /api/dictate re-checks the prefix anyway.
 */
export async function mintDictationUpload(): Promise<
  { ok: true; path: string; signedUrl: string } | { ok: false; error: string }
> {
  const gate = await readGate();
  if (gate.kind === "anonymous") return { ok: false, error: "unauthorized" };

  const supabase = createServiceClient();
  const path = dictationObjectPath();
  const { data, error } = await supabase.storage
    .from(INBOUND_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "no signed upload url" };
  }
  // `data.path` is what the storage API will actually accept on the PUT.
  return { ok: true, path: data.path ?? `${DICTATION_PREFIX}/`, signedUrl: data.signedUrl };
}
