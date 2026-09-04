/**
 * The pictures attached to an offer's lines.
 *
 * `attachments` is a generic table keyed by `(entity_type, entity_id)` with no
 * FK, so this is the one place that knows offer lines use `offer_line` — the
 * detail page and the document loader both read through here rather than each
 * spelling the filter out.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

export const OFFER_LINE_ENTITY = "offer_line";

/** line id → picture URL, for the lines that have one. */
export async function loadOfferLineImages(
  supabase: SupabaseClient<Database>,
  lineIds: string[],
): Promise<Record<string, string>> {
  if (lineIds.length === 0) return {};
  const { data } = await supabase
    .from("attachments")
    .select("entity_id, file_url, created_at")
    .eq("entity_type", OFFER_LINE_ENTITY)
    .in("entity_id", lineIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const byLine: Record<string, string> = {};
  for (const row of data ?? []) {
    // Newest wins if a retirement ever failed and two rows are live.
    byLine[row.entity_id] = row.file_url;
  }
  return byLine;
}
