/**
 * Where a signed agreement's pages live (migration 110): the PRIVATE
 * `agreement-documents` bucket, one folder per document. A signed contract is
 * not a public picture, so pages are read back through short-lived signed
 * URLs, never a public one — the `attachments.file_url` of a page holds the
 * object PATH, not a URL.
 *
 * The browser uploads straight to storage with a signed upload URL (the
 * dictation pattern): a multi-page scan is past a server action's 1 MB body
 * limit and Vercel's 4.5 MB request cap long before it is past this bucket's.
 */
export const AGREEMENT_DOCUMENTS_BUCKET = "agreement-documents";
export const AGREEMENT_DOCUMENT_ENTITY = "service_agreement_document";

/** What a page may be. Word files are refused: the model cannot read .docx. */
export const DOCUMENT_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type DocumentMime = (typeof DOCUMENT_MIME)[number];

/** Per file. The model takes a 32 MB request; a PDF of a few pages is far under. */
export const MAX_DOCUMENT_FILE_BYTES = 20 * 1024 * 1024;
/** Pages per document — a contract, not an archive. */
export const MAX_DOCUMENT_FILES = 20;

export function isDocumentMime(type: string): type is DocumentMime {
  return (DOCUMENT_MIME as readonly string[]).includes(type);
}

export function extFor(type: DocumentMime): string {
  switch (type) {
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

export function documentObjectPath(
  documentId: string,
  index: number,
  type: DocumentMime,
): string {
  const n = String(index + 1).padStart(2, "0");
  return `${documentId}/${n}-${crypto.randomUUID()}.${extFor(type)}`;
}

/**
 * Is this path inside the document's own folder? The browser hands paths back,
 * so they are untrusted — anything else is refused rather than registered.
 */
export function isDocumentPath(documentId: string, path: string): boolean {
  return (
    path.startsWith(`${documentId}/`) &&
    !path.includes("..") &&
    path.split("/").length === 2
  );
}
