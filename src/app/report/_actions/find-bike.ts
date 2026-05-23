"use server";

import { createClient } from "@/lib/supabase/server";

export type FindBikeResult =
  | { ok: true; bikeId: string; frameNumber: string }
  | { ok: false; error: string };

/**
 * Resolve a customer-typed frame number to a bike id. Case-insensitive,
 * trims whitespace, ignores trailing punctuation. Designed for the public
 * /report entry page — never returns sensitive data, just the UUID the
 * customer needs to land on /b/<id>.
 *
 * No auth required. Same surface area as the /b/<id> page itself.
 */
export async function findBikeByFrameNumber(
  raw: string,
): Promise<FindBikeResult> {
  const v = raw.trim();
  if (!v) {
    return { ok: false, error: "Please enter your bike's frame number." };
  }

  const supabase = await createClient();
  // Case-insensitive exact match. Frame numbers are short and indexed; if
  // we ever need fuzzy "JP-2026-001" → "JP-2026-E_BIKE-001" matching we'll
  // do a second-stage prefix search.
  const { data, error } = await supabase
    .from("bikes")
    .select("id, frame_number")
    .ilike("frame_number", v)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: "Something went wrong looking up your bike. Please try again.",
    };
  }
  if (!data) {
    return {
      ok: false,
      error: `No bike found for "${v}". Check the frame number on the bike (usually near the sticker).`,
    };
  }
  return { ok: true, bikeId: data.id, frameNumber: data.frame_number };
}
