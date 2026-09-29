import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";

import { readHasCapability, readGate } from "@/lib/auth/read-session";
import { loadInboundSettings } from "@/lib/inbound/settings";
import { readAgreementDocument, type DocumentPage } from "@/lib/service-agreements/documents/read";
import {
  AGREEMENT_DOCUMENTS_BUCKET,
  AGREEMENT_DOCUMENT_ENTITY,
  isDocumentMime,
} from "@/lib/service-agreements/documents/storage";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
/** The model reads several pages; the reader's own timeout sits under this. */
export const maxDuration = 60;

/**
 * Read an uploaded agreement's pages into a PROPOSAL (migration 110). A route
 * rather than a server action because `maxDuration` can only be set at a
 * route. Middleware skips /api, so this authenticates itself — and checks
 * `agreements`, the capability every other document writer checks.
 *
 * Writes only the document's `reading` (or its failure); never an agreement,
 * never a line. Safe to run twice — *Read again* is this same call.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await readGate();
  if (gate.kind === "anonymous") {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  if (!(await readHasCapability("agreements"))) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: doc } = await supabase
    .from("service_agreement_documents")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (doc.status === "confirmed") {
    return NextResponse.json({ ok: false, reason: "confirmed" }, { status: 409 });
  }

  const fail = async (reason: string, detail?: string) => {
    await supabase
      .from("service_agreement_documents")
      .update({
        status: "failed",
        read_error: detail ? `${reason}: ${detail}`.slice(0, 1000) : reason,
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ ok: false, reason }, { status: 200 });
  };

  const { data: attachments } = await supabase
    .from("attachments")
    .select("file_url, mime_type")
    .eq("entity_type", AGREEMENT_DOCUMENT_ENTITY)
    .eq("entity_id", id)
    .is("deleted_at", null)
    .order("file_url");

  const pages: DocumentPage[] = [];
  for (const a of attachments ?? []) {
    if (!a.mime_type || !isDocumentMime(a.mime_type)) continue;
    const { data: blob, error } = await supabase.storage
      .from(AGREEMENT_DOCUMENTS_BUCKET)
      .download(a.file_url);
    if (error || !blob) return fail("download_failed", error?.message);
    pages.push({
      mime: a.mime_type,
      base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
    });
  }
  if (pages.length === 0) return fail("no_pages");

  const settings = await loadInboundSettings(supabase);
  const result = await readAgreementDocument(pages, {
    provider: settings.extractionProvider,
    model: settings.extractionModel,
    // Remarks are for whoever reads the review page — the viewer's language.
    remarksLanguage: (await getLocale()) === "da" ? "da" : "en",
  });
  if (!result.ok) return fail(result.reason, result.detail);

  const { error: saveErr } = await supabase
    .from("service_agreement_documents")
    .update({
      status: "read",
      reading: result.reading,
      read_error: null,
      read_model: settings.extractionModel,
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (saveErr) return fail("save_failed", saveErr.message);
  return NextResponse.json({ ok: true, frames: result.reading.frames.length });
}
