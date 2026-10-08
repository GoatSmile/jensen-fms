"use server";

import { after } from "next/server";
import { getTranslations } from "next-intl/server";

import { readGate, readPersonId } from "@/lib/auth/read-session";
import { revalidateInbound } from "@/lib/calls/revalidate";
import { INBOUND_BUCKET, isNotePath, noteObjectPath } from "@/lib/dictation/storage";
import { planNote } from "@/lib/inbound/command/plan-notes";
import { transcribeNote } from "@/lib/inbound/pipeline";
import { sanitizeNoteContext } from "@/lib/notes/context";
import { ASSISTANT_MODES, type AssistantMode } from "@/lib/notes/mode";
import { createServiceClient } from "@/lib/supabase/service";

type Result = { ok: true; id: string } | { ok: false; error: string };

/**
 * Spoken notes (plan-inbox-notes.md, slice 1). A note is an inbound message on
 * the `note` channel, owned by its speaker (`handled_by_person_id`, so the Calls
 * page's own-line scope shows Finn his own) and saved BEFORE it is
 * transcribed: the person hears "saved" at once — in the car that is the whole
 * point — and the text arrives a few seconds later. A failed transcription
 * keeps the audio for a retry from the note's page.
 */

/** Stage 1: a one-shot signed URL the browser PUTs the WAV to (dictation's pattern). */
export async function mintNoteUpload(): Promise<
  { ok: true; path: string; signedUrl: string } | { ok: false; error: string }
> {
  const gate = await readGate();
  if (gate.kind === "anonymous") return { ok: false, error: "unauthorized" };
  const supabase = createServiceClient();
  const path = noteObjectPath();
  const { data, error } = await supabase.storage.from(INBOUND_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "no signed upload url" };
  return { ok: true, path: data.path ?? path, signedUrl: data.signedUrl };
}

/** Stage 2: keep the note, then transcribe it after the response has gone. */
export async function saveSpokenNote(path: string, context: unknown): Promise<Result> {
  const t = await getTranslations("errors");
  const personId = await readPersonId();
  if (!personId) return { ok: false, error: t("notesNeedPerson") };
  if (!isNotePath(path)) return { ok: false, error: t("notesBadPath") };

  const id = await insertNote({
    personId,
    context,
    media_path: path,
    media_mime_type: "audio/wav",
    status: "received",
  });
  if (!id.ok) return { ok: false, error: t("couldNotSave", { detail: id.error }) };

  // Then read it for suggestions (slice 3); a failure is left for the
  // five-minute pass, which plans any note it finds unplanned.
  after(async () => {
    const supabase = createServiceClient();
    const tr = await transcribeNote(supabase, id.id);
    if (tr.ok) await planNote(supabase, id.id);
  });
  revalidateInbound(id.id);
  return { ok: true, id: id.id };
}

/** A typed (or dictated-into-the-box) note from the panel: no audio to transcribe. */
export async function saveTypedNote(text: string, context: unknown): Promise<Result> {
  const t = await getTranslations("errors");
  const personId = await readPersonId();
  if (!personId) return { ok: false, error: t("notesNeedPerson") };
  const body = text.trim();
  if (!body) return { ok: false, error: t("notesEmpty") };

  const id = await insertNote({ personId, context, body_text: body.slice(0, 5000), status: "understood" });
  if (!id.ok) return { ok: false, error: t("couldNotSave", { detail: id.error }) };
  after(async () => {
    await planNote(createServiceClient(), id.id);
  });
  revalidateInbound(id.id);
  return { ok: true, id: id.id };
}

/** The person's own choice of what the button does. */
export async function setAssistantMode(mode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getTranslations("errors");
  const personId = await readPersonId();
  if (!personId) return { ok: false, error: t("notesNeedPerson") };
  if (!(ASSISTANT_MODES as readonly string[]).includes(mode)) return { ok: false, error: t("notesBadMode") };
  const { error } = await createServiceClient()
    .from("people")
    .update({ assistant_mode: mode as AssistantMode, last_actor_id: personId })
    .eq("id", personId);
  if (error) return { ok: false, error: t("couldNotSave", { detail: error.message }) };
  // The button already shows the pick (it holds the mode itself); nothing on
  // the page changes, so there is nothing to revalidate.
  return { ok: true };
}

async function insertNote(fields: {
  personId: string;
  context: unknown;
  media_path?: string;
  media_mime_type?: string;
  body_text?: string;
  status: "received" | "understood";
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await createServiceClient()
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
      channel_meta: { source: "in_app_note" },
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "no row" };
  return { ok: true, id: data.id };
}
