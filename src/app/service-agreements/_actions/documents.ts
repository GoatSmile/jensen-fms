"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import {
  AGREEMENT_DOCUMENTS_BUCKET,
  AGREEMENT_DOCUMENT_ENTITY,
  MAX_DOCUMENT_FILES,
  MAX_DOCUMENT_FILE_BYTES,
  documentObjectPath,
  isDocumentMime,
  isDocumentPath,
} from "@/lib/service-agreements/documents/storage";
import { createServiceClient } from "@/lib/supabase/service";

/*
 * A signed agreement's upload, in two stages (migration 110; the dictation
 * pattern): `startAgreementDocument` makes the document row and mints one
 * signed upload URL per page, the BROWSER puts the bytes straight into the
 * private bucket, and `finishAgreementDocument` registers the pages that
 * actually arrived. The bytes never ride a server action — a few phone photos
 * are past its 1 MB body limit. Reading is a separate route
 * (/api/agreement-documents/[id]/read) because it needs a longer maxDuration.
 *
 * Every action checks `agreements` itself: the customer page that hosts the
 * upload is gated by `customers`, and a server action is callable from any
 * page that imports it.
 */

export type FileMeta = { name: string; type: string; size: number };

export type StartResult =
  | { ok: true; documentId: string; uploads: { path: string; signedUrl: string }[] }
  | { ok: false; error: string };

export async function startAgreementDocument(
  organizationId: string,
  files: FileMeta[],
  agreementId?: string | null,
): Promise<StartResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("agreements"))) {
    return { ok: false, error: t("saDocNeedsAgreements") };
  }
  if (files.length === 0) return { ok: false, error: t("saDocNoFiles") };
  if (files.length > MAX_DOCUMENT_FILES) {
    return { ok: false, error: t("saDocTooManyFiles", { max: MAX_DOCUMENT_FILES }) };
  }
  for (const f of files) {
    if (!isDocumentMime(f.type)) return { ok: false, error: t("saDocBadType", { name: f.name }) };
    if (f.size <= 0 || f.size > MAX_DOCUMENT_FILE_BYTES) {
      return {
        ok: false,
        error: t("saDocTooLarge", { name: f.name, mb: MAX_DOCUMENT_FILE_BYTES / 1024 / 1024 }),
      };
    }
  }

  const supabase = createServiceClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!org) return { ok: false, error: t("notFound") };
  if (agreementId) {
    const { data: sa } = await supabase
      .from("service_agreements")
      .select("id")
      .eq("id", agreementId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!sa) return { ok: false, error: t("notFound") };
  }

  const { data: doc, error } = await supabase
    .from("service_agreement_documents")
    .insert({
      organization_id: organizationId,
      agreement_id: agreementId ?? null,
      uploaded_by: await readPersonId(),
    })
    .select("id")
    .single();
  if (error || !doc) {
    return { ok: false, error: t("saDocCouldNotCreate", { detail: error?.message ?? "" }) };
  }

  const uploads: { path: string; signedUrl: string }[] = [];
  for (const [i, f] of files.entries()) {
    if (!isDocumentMime(f.type)) continue;
    const path = documentObjectPath(doc.id, i, f.type);
    const { data, error: signErr } = await supabase.storage
      .from(AGREEMENT_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(path);
    if (signErr || !data) {
      await supabase.from("service_agreement_documents").delete().eq("id", doc.id);
      return { ok: false, error: t("saDocCouldNotCreate", { detail: signErr?.message ?? "" }) };
    }
    uploads.push({ path: data.path ?? path, signedUrl: data.signedUrl });
  }
  return { ok: true, documentId: doc.id, uploads };
}

export async function finishAgreementDocument(
  documentId: string,
  files: (FileMeta & { path: string })[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("agreements"))) {
    return { ok: false, error: t("saDocNeedsAgreements") };
  }
  const supabase = createServiceClient();
  const { data: doc } = await supabase
    .from("service_agreement_documents")
    .select("id, organization_id, agreement_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: t("saDocNotFound") };

  // Only register what is really in the folder — the client's list is a claim.
  const { data: objects, error: listErr } = await supabase.storage
    .from(AGREEMENT_DOCUMENTS_BUCKET)
    .list(documentId, { limit: 100 });
  if (listErr) return { ok: false, error: t("saDocCouldNotSave", { detail: listErr.message }) };
  const present = new Set((objects ?? []).map((o) => `${documentId}/${o.name}`));

  const rows = files
    .filter((f) => isDocumentPath(documentId, f.path) && isDocumentMime(f.type))
    .map((f) => ({ ...f, arrived: present.has(f.path) }));
  if (rows.length === 0 || rows.some((r) => !r.arrived)) {
    return { ok: false, error: t("saDocUploadMissing") };
  }

  const personId = await readPersonId();
  const { error } = await supabase.from("attachments").insert(
    rows.map((r) => ({
      entity_type: AGREEMENT_DOCUMENT_ENTITY,
      entity_id: documentId,
      file_url: r.path,
      file_name: r.name || r.path,
      file_size_bytes: r.size,
      mime_type: r.type,
      purpose: "agreement_page",
      uploaded_by: personId,
    })),
  );
  if (error) return { ok: false, error: t("saDocCouldNotSave", { detail: error.message }) };

  revalidatePath(`/organizations/${doc.organization_id}`);
  if (doc.agreement_id) revalidatePath(`/service-agreements/${doc.agreement_id}`);
  return { ok: true };
}

/**
 * Throw away an UNCONFIRMED document — a wrong photo, a duplicate. A confirmed
 * one is the legal record behind lines and stays.
 */
export async function deleteAgreementDocument(
  documentId: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("agreements"))) {
    return { ok: false, error: t("saDocNeedsAgreements") };
  }
  const supabase = createServiceClient();
  const { data: doc } = await supabase
    .from("service_agreement_documents")
    .select("id, status, organization_id, agreement_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: t("saDocNotFound") };
  if (doc.status === "confirmed") return { ok: false, error: t("saDocAlreadyConfirmed") };

  const { data: pages } = await supabase
    .from("attachments")
    .select("id, file_url")
    .eq("entity_type", AGREEMENT_DOCUMENT_ENTITY)
    .eq("entity_id", documentId);
  const paths = (pages ?? []).map((p) => p.file_url);
  if (paths.length > 0) {
    await supabase.storage.from(AGREEMENT_DOCUMENTS_BUCKET).remove(paths);
    await supabase
      .from("attachments")
      .delete()
      .eq("entity_type", AGREEMENT_DOCUMENT_ENTITY)
      .eq("entity_id", documentId);
  }
  const { error } = await supabase.from("service_agreement_documents").delete().eq("id", documentId);
  if (error) return { ok: false, error: t("saDocCouldNotSave", { detail: error.message }) };

  revalidatePath(`/organizations/${doc.organization_id}`);
  if (doc.agreement_id) revalidatePath(`/service-agreements/${doc.agreement_id}`);
  return { ok: true, organizationId: doc.organization_id };
}
