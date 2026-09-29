import { NextResponse } from "next/server";

import { refuseUnlessCron } from "@/lib/cron/auth";
import { runJob } from "@/lib/cron/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each imported call waits on transcription (~90 s at worst), side by side;
// a run past this is cut short and the next one, five minutes on, carries on.
export const maxDuration = 300;

/**
 * Scheduled in vercel.json (every 5 minutes). The work lives in
 * src/lib/cron/jobs.ts ("import-calls"), shared with *Run now* on /admin/jobs
 * and *Fetch calls now* on /inbox; runJob records the run.
 */
export async function GET(request: Request) {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  const outcome = await runJob("import-calls", "schedule");
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 500 });
}
