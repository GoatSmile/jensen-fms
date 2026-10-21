import "server-only";

import { sanitizeNoteContext } from "@/lib/notes/context";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * Keep a NOTE — an inbound message on the `note` channel, owned by its speaker
 * (`handled_by_person_id`) so the Inbox's own-line scope shows it to them.
 * The ONE writer: the spoken note, the typed note in the panel and the
 * secretary's `save_note` all come through here.
 */
export async function insertNote(
  supabase: ReturnType<typeof createServiceClient>,
  fields: {
    personId: string;
    context: unknown;
    media_path?: string;
    media_mime_type?: string;
    body_text?: string;
    status: "received" | "understood";
    source?: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("inbound_messages")
    .insert({
      channel: "note",
      kind: "note",
      status: fields.status,
      received_at: new Date().toISOString(),
      media_path: fields.media_path ?? null,
      media_mime_type: fields.media_mime_type ?? null,
      body_text: fields.body_text ?? null,
      handled_by_person_id: fields.personId,
      commanded_by: fields.personId,
      note_context: sanitizeNoteContext(fields.context),
      channel_meta: { source: fields.source ?? "in_app_note" },
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "no row" };
  return { ok: true, id: data.id };
}
