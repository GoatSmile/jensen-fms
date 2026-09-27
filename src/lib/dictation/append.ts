import type { DictateLanguage } from "@/components/dictate-button";

/**
 * Append an accepted transcript to what is already typed — on its own line
 * when there is text, so dictating twice never runs two sentences together.
 * Pure and client-safe; shared by every message box with a Dictate button.
 */
export function appendDictated(prev: string, text: string): string {
  return prev.trim() ? `${prev.replace(/\s+$/, "")}\n${text}` : text;
}

/**
 * The dictation language for a DOCUMENT's language: a message to a customer or
 * supplier is spoken in the language they will read, not the UI's.
 */
export function dictateLanguageFor(documentLanguage: string | null | undefined): DictateLanguage {
  return documentLanguage === "da" ? "da-DK" : "en-US";
}
