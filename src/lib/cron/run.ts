import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

import { JOBS, type JobOutcome } from "./jobs";

/**
 * Run one job and RECORD it (migration 109): a `cron_runs` row is written
 * before the work starts and finished after, with the outcome's summary — so
 * /admin/jobs can say when each job last ran and how it went, and a run that
 * crashed shows as started-but-never-finished. Recording never blocks the
 * work: a failed insert still runs the job.
 */
export async function runJob(
  key: string,
  trigger: "schedule" | "manual",
  triggeredBy: string | null = null,
): Promise<JobOutcome> {
  const job = JOBS[key];
  if (!job) return { ok: false, summary: `Unknown job ${key}` };
  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from("cron_runs")
    .insert({ job: key, trigger, triggered_by: triggeredBy })
    .select("id")
    .single();

  let outcome: JobOutcome;
  try {
    outcome = await job(supabase);
  } catch (e) {
    outcome = { ok: false, summary: e instanceof Error ? e.message : String(e) };
  }

  if (row) {
    await supabase
      .from("cron_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: outcome.ok,
        summary: outcome.summary.slice(0, 2000),
        detail: outcome.detail ?? null,
      })
      .eq("id", row.id);
  }
  return outcome;
}
