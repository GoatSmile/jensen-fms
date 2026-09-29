"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { runJob } from "@/lib/cron/run";

export type ImportCallsResult =
  | { ok: true; imported: number; summary: string }
  | { ok: false; error: string };

/**
 * *Fetch calls now* on /inbox — the scheduled "import-calls" job, run by hand
 * and recorded as `manual` with who pressed it (/admin/jobs shows it). The
 * job is idempotent on the call's external id, so pressing it while the
 * schedule runs imports nothing twice. Needs `inbox`, checked here because
 * the action is callable from anywhere that imports it.
 */
export async function importCallsNow(): Promise<ImportCallsResult> {
  const t = await getTranslations("errors");
  if (!(await readHasCapability("inbox"))) {
    return { ok: false, error: t("callImportNeedsInbox") };
  }
  const outcome = await runJob("import-calls", "manual", await readPersonId());
  revalidatePath("/inbox");
  const detail = (outcome.detail ?? {}) as { imported?: unknown };
  return outcome.ok
    ? {
        ok: true,
        imported: typeof detail.imported === "number" ? detail.imported : 0,
        summary: outcome.summary,
      }
    : { ok: false, error: t("callImportRunFailed", { detail: outcome.summary }) };
}
