"use server";

import { getTranslations } from "next-intl/server";

import { canActOnInbound } from "@/lib/calls/access";
import { createServiceClient } from "@/lib/supabase/service";

export type AudioUrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * A short-lived signed link to one call's recording, minted only when someone
 * presses play — the list would otherwise sign every row on every render.
 * Same access rule as the page: your own calls, or all of them with `inbox`.
 */
export async function getCallAudioUrl(messageId: string): Promise<AudioUrlResult> {
  const t = await getTranslations("errors");
  if (!(await canActOnInbound(messageId))) return { ok: false, error: t("callNoAccess") };
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("inbound_messages")
    .select("media_path")
    .eq("id", messageId)
    .maybeSingle();
  if (!row?.media_path) return { ok: false, error: t("inboundNoAudio") };
  const { data } = await supabase.storage.from("inbound").createSignedUrl(row.media_path, 900);
  return data?.signedUrl ? { ok: true, url: data.signedUrl } : { ok: false, error: t("inboundNoAudio") };
}
