import { after } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Fire-and-forget page-view tracker for the public /report surfaces.
 *
 * Uses Next.js 15 `after()` so the insert runs after the response has
 * been sent — the customer never waits on this write, and a tracking
 * outage can't break the actual page render.
 *
 * Stores only `(path, visited_at)`. No IP, no UA — GDPR-friendly,
 * aggregate counts only. If we later need session-level analytics we
 * can layer a hashed-IP table on top; today we don't.
 */
export function trackReportPageView(path: string): void {
  after(async () => {
    try {
      const supabase = createServiceClient();
      await supabase.from("report_page_views").insert({ path });
    } catch (err) {
      // Tracking failures are not actionable from the customer's side;
      // log to the server console for visibility and move on.
      console.error("[trackReportPageView] failed", { path, err });
    }
  });
}

/**
 * Aggregate visits for one or more paths over the given window. Used by
 * the dashboard + admin settings to show "N visits in the last 7 days".
 */
export async function reportPageViewCount(
  paths: readonly string[],
  withinDays: number,
): Promise<number> {
  const supabase = createServiceClient();
  const sinceIso = new Date(
    Date.now() - withinDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { count, error } = await supabase
    .from("report_page_views")
    .select("id", { count: "exact", head: true })
    .in("path", [...paths])
    .gte("visited_at", sinceIso);
  if (error) return 0;
  return count ?? 0;
}
