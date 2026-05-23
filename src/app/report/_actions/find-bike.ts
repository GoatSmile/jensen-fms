"use server";

import { headers } from "next/headers";

import { createServiceClient } from "@/lib/supabase/service";

export type FindBikeResult =
  | { ok: true; bikeId: string; frameNumber: string }
  | { ok: false; error: string };

const LOOKUP_LIMIT_PER_HOUR = 30;

async function getRequestIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}

/**
 * Resolve a customer-typed frame number to a bike id. Case-insensitive,
 * trims whitespace. Designed for the public /report entry page — never
 * returns sensitive data, just the UUID the customer needs to land on
 * /b/<id>.
 *
 * Rate-limit: 30 lookups per IP per hour. Logged to
 * frame_lookup_attempts whether the lookup hit or missed, so we can
 * spot enumeration scans in the data. Ledger is separate from
 * public_report_attempts (the submission rate-limit) — a customer
 * mistyping the number ten times shouldn't burn through their
 * "submit a report" budget.
 */
export async function findBikeByFrameNumber(
  raw: string,
): Promise<FindBikeResult> {
  const v = raw.trim();
  if (!v) {
    return { ok: false, error: "Please enter your bike's frame number." };
  }

  // Service client so the rate-limit ledger writes don't depend on RLS
  // policies we haven't shipped yet.
  const supabase = createServiceClient();
  const ip = await getRequestIp();

  // Throttle scrapers before doing the expensive search.
  const { count: recentAttempts } = await supabase
    .from("frame_lookup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte(
      "attempted_at",
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    );
  if ((recentAttempts ?? 0) >= LOOKUP_LIMIT_PER_HOUR) {
    // Log the blocked attempt so abuse patterns are visible in the data
    // even when we don't serve them.
    await supabase
      .from("frame_lookup_attempts")
      .insert({ ip, found: false });
    return {
      ok: false,
      error: "Too many lookups from this device. Try again in an hour.",
    };
  }

  const { data, error } = await supabase
    .from("bikes")
    .select("id, frame_number")
    .ilike("frame_number", v)
    .is("deleted_at", null)
    .maybeSingle();

  // Record the attempt either way — found or not — so the rate limit
  // covers both legitimate retries and enumeration.
  await supabase
    .from("frame_lookup_attempts")
    .insert({ ip, found: !!data });

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
