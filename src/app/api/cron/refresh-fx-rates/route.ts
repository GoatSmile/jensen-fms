import { NextResponse } from "next/server";

import { refuseUnlessCron } from "@/lib/cron/auth";
import { runJob } from "@/lib/cron/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled in vercel.json. The work lives in src/lib/cron/jobs.ts
 * ("refresh-fx-rates"), shared with *Run now* on /admin/jobs; runJob records the run.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  const outcome = await runJob("refresh-fx-rates", "schedule");
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 500 });
}
