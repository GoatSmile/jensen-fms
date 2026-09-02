"use server";

import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

export type OutboundBodyResult =
  { ok: true; subject: string; html: string } | { ok: false; error: string };

/**
 * Fetch one sent message's body on demand.
 *
 * The lists carry metadata only — shipping every rendered document to the
 * browser to populate a table nobody has opened yet would be absurd. The HTML
 * comes back as a string and the viewer renders it inside a sandboxed iframe,
 * so a stored document's own CSS cannot leak into the app.
 */
export async function loadOutboundBody(
  id: string,
): Promise<OutboundBodyResult> {
  const t = await getTranslations("errors");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outbound_messages")
    .select("subject, body_html")
    .eq("id", id)
    .maybeSingle();
  if (error)
    return {
      ok: false,
      error: t("outboundBodyFailed", { detail: error.message }),
    };
  if (!data) return { ok: false, error: t("outboundBodyMissing") };
  return { ok: true, subject: data.subject, html: data.body_html };
}
