"use server";

import { getTranslations } from "next-intl/server";

import { readPersonId } from "@/lib/auth/read-session";
import { readCallsScope } from "@/lib/calls/access";
import { runJob } from "@/lib/cron/run";
import { revalidateInbound } from "@/lib/calls/revalidate";

export type ImportCallsResult =
  | { ok: true; imported: number; summary: string }
  | { ok: false; error: string };

/**
 * *Fetch calls now* on /calls — the scheduled "import-calls" job, run by hand
 * and recorded as `manual` with who pressed it (/admin/jobs shows it). The
 * job is idempotent on the call's external id, so pressing it while the
 * schedule runs imports nothing twice. Needs Calls access, checked here because
 * the action is callable from anywhere that imports it.
 */
export async function importCallsNow(): Promise<ImportCallsResult> {
  const t = await getTranslations("errors");
  // Anyone who may open the Calls page may pull new calls: the import only
  // ever brings in recordings, and each lands on its own line's person.
  if (!(await readCallsScope())) {
    return { ok: false, error: t("callImportNeedsInbox") };
  }
  const outcome = await runJob("import-calls", "manual", await readPersonId());
  revalidateInbound();
  const detail = (outcome.detail ?? {}) as { imported?: unknown };
  return outcome.ok
    ? {
        ok: true,
        imported: typeof detail.imported === "number" ? detail.imported : 0,
        summary: outcome.summary,
      }
    : { ok: false, error: t("callImportRunFailed", { detail: outcome.summary }) };
}
