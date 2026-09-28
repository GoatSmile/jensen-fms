import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Panel } from "@/components/ui/panel";
import { listScheduledJobs, nextRun } from "@/lib/cron/schedule";
import { createServiceClient } from "@/lib/supabase/service";

import { RunNowButton } from "./_components/run-now-button";

export const dynamic = "force-dynamic";

/** "notify-overdue-invoices" → "notifyOverdueInvoices" (message keys). */
const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * Scheduled jobs (migration 109): what runs on its own, when it runs next,
 * and how its last runs went. The LIST comes from vercel.json — what the
 * platform actually schedules — so a new job appears without touching this
 * page; its explanation comes from the messages, and a job without one, or
 * one the code cannot run, says so. Gated on the `jobs` capability.
 */
export default async function JobsPage() {
  const [t, locale] = await Promise.all([getTranslations("adminJobs"), getLocale()]);
  const jobs = listScheduledJobs();

  // Service client: the page is capability-gated, and run history is
  // system data rather than anyone's business record.
  const supabase = createServiceClient();
  const { data: runs } = await supabase
    .from("cron_runs")
    .select("id, job, trigger, started_at, finished_at, ok, summary, triggered_by")
    .order("started_at", { ascending: false })
    .limit(300);
  const personIds = [
    ...new Set((runs ?? []).map((r) => r.triggered_by).filter(Boolean) as string[]),
  ];
  const names = new Map<string, string>();
  if (personIds.length > 0) {
    const { data: people } = await supabase
      .from("people")
      .select("id, full_name")
      .in("id", personIds);
    for (const p of people ?? []) names.set(p.id, p.full_name);
  }

  const fmt = (iso: string | Date) =>
    new Date(iso).toLocaleString(locale === "da" ? "da-DK" : "en-GB", {
      timeZone: "Europe/Copenhagen",
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("intro")}</p>
      </header>

      {jobs.map((job) => {
        const m = camel(job.key);
        const hasText = t.has(`jobs.${m}.title`);
        const jobRuns = (runs ?? []).filter((r) => r.job === job.key);
        const last = jobRuns[0];
        const next = job.schedule ? nextRun(job.schedule) : null;
        return (
          <Panel key={job.key} contentClassName="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="font-semibold">
                  {hasText ? t(`jobs.${m}.title`) : job.key}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {hasText ? t(`jobs.${m}.what`) : t("noDescription")}
                </p>
                <p className="text-muted-foreground font-mono text-xs">
                  {job.path ?? "—"} · {job.schedule ?? t("notScheduled")}
                </p>
              </div>
              {!job.unknownToCode ? <RunNowButton jobKey={job.key} /> : null}
            </div>

            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-xs">{t("lastRun")}</dt>
                <dd>
                  {last ? (
                    <span className={last.ok === false ? "text-alert" : last.ok ? "text-good" : "text-money"}>
                      {fmt(last.started_at)} ·{" "}
                      {last.ok === true
                        ? t("ok")
                        : last.ok === false
                          ? t("failed")
                          : t("unfinished")}
                    </span>
                  ) : (
                    <span className="text-money">{t("neverRun")}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{t("nextRun")}</dt>
                <dd>{next ? fmt(next) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{t("ifStops")}</dt>
                <dd className="text-xs">{hasText ? t(`jobs.${m}.breaks`) : "—"}</dd>
              </div>
            </dl>

            {job.unknownToCode ? (
              <p className="bg-money-wash text-money rounded-lg px-3 py-2 text-xs">{t("unknownToCode")}</p>
            ) : null}
            {job.notScheduled ? (
              <p className="bg-money-wash text-money rounded-lg px-3 py-2 text-xs">{t("notScheduledWarn")}</p>
            ) : null}

            {jobRuns.length > 0 ? (
              <ul className="divide-rule divide-y text-xs">
                {jobRuns.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                    <span className="tabular-nums">{fmt(r.started_at)}</span>
                    <span className={r.ok === false ? "text-alert" : r.ok ? "text-good" : "text-money"}>
                      {r.ok === true ? t("ok") : r.ok === false ? t("failed") : t("unfinished")}
                    </span>
                    <span className="text-muted-foreground">
                      {r.trigger === "manual"
                        ? t("byPerson", { name: (r.triggered_by && names.get(r.triggered_by)) || "—" })
                        : t("bySchedule")}
                    </span>
                    {r.summary ? <span className="text-ink-2 min-w-0 break-words">{r.summary}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        );
      })}
    </div>
  );
}
