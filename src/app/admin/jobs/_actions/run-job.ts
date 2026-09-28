"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { JOBS } from "@/lib/cron/jobs";
import { runJob } from "@/lib/cron/run";

export type RunJobResult =
  | { ok: true; summary: string }
  | { ok: false; error: string };

/**
 * *Run now* on /admin/jobs: the same function the schedule calls, recorded
 * as `manual` with who pressed it. Needs `jobs`. Every job is safe to run
 * twice (each is idempotent or guarded on state), which is what makes a
 * button acceptable at all.
 */
export async function runJobNow(key: string): Promise<RunJobResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("jobs"))) {
    return { ok: false, error: t("jobsNeedsCapability") };
  }
  if (!(key in JOBS)) return { ok: false, error: t("jobsUnknown") };
  const outcome = await runJob(key, "manual", await readPersonId());
  revalidatePath("/admin/jobs");
  revalidatePath("/admin");
  return outcome.ok
    ? { ok: true, summary: outcome.summary }
    : { ok: false, error: outcome.summary };
}
