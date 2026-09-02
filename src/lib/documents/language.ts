/**
 * The language a SUPPLIER-facing document renders in. It is a fact about the
 * recipient (`suppliers.document_language`, migration 89), never the UI locale
 * of whoever clicks Print — Metacoat reads Danish whatever the shop tablet is
 * set to. Shared by the purchase-order and service-order document loaders.
 */
export type DocumentLanguage = "en" | "da";

/** `suppliers.document_language` is a CHAR(2) with a CHECK; anything else is English. */
export function asDocumentLanguage(
  v: string | null | undefined,
): DocumentLanguage {
  return v?.trim().toLowerCase() === "da" ? "da" : "en";
}
