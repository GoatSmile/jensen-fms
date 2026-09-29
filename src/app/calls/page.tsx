import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PhoneCall } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/empty-state";
import { readHasCapability, readPersonId } from "@/lib/auth/read-session";
import { readCallsScope } from "@/lib/calls/access";
import { danishDayKey, dayHeading, shiftDayKey } from "@/lib/calls/days";
import { loadCallsPage } from "@/lib/calls/load";
import { loadInboundSettings } from "@/lib/inbound/settings";
import { createServiceClient } from "@/lib/supabase/service";
import { cn } from "@/lib/utils";

import { CallRow } from "./_components/call-row";
import { FetchCallsButton } from "./_components/fetch-calls-button";

// *Fetch calls now* runs the import inline, and each new call waits on its
// transcription — the action inherits this page's limit.
export const maxDuration = 300;

/**
 * Calls — every recorded call and voicemail, by Danish day, newest first
 * (DECISIONS 2026-09-29). Tabs per person (and per shared line) for the
 * office; a technician sees only their own line and no tabs. Each call is
 * sorted into to do / check / done / no action by src/lib/calls/triage.ts,
 * and a day holding open work is never folded (src/lib/calls/days.ts).
 */
export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; until?: string }>;
}) {
  const scope = await readCallsScope();
  if (!scope) redirect("/");
  const sp = await searchParams;
  const [t, tCommon, locale, viewerId, canOpenTickets] = await Promise.all([
    getTranslations("calls"),
    getTranslations("common"),
    getLocale(),
    readPersonId(),
    readHasCapability("maintenance"),
  ]);

  // Service client: the rows are scoped by readCallsScope in the loader, the
  // one place that rule is applied (the same client the detail page uses).
  const supabase = createServiceClient();
  const [page, settings] = await Promise.all([
    loadCallsPage(supabase, { scope, viewerId, tab: sp.tab ?? null, until: sp.until ?? null }),
    loadInboundSettings(supabase),
  ]);

  const todayKey = danishDayKey(new Date());
  const yesterdayKey = shiftDayKey(todayKey, -1);
  const tabHref = (key: string) => `/calls?tab=${encodeURIComponent(key)}`;
  const earlierHref =
    `/calls?until=${page.earlierKey}` + (page.activeTab !== "own" ? `&tab=${encodeURIComponent(page.activeTab)}` : "");
  const tabLabel = (key: string, label: string) =>
    key === "all" ? t("tabEveryone") : key === "other" ? t("tabOther") : label;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{scope.all ? t("title") : t("titleOwn")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        {settings.callImportProvider ? <FetchCallsButton /> : null}
      </header>

      {page.tabs.length > 1 ? (
        <nav aria-label={t("tabsAria")} className="flex flex-wrap gap-1.5">
          {page.tabs.map((tab) => {
            const active = tab.key === page.activeTab;
            return (
              <Link
                key={tab.key}
                href={tabHref(tab.key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-brand text-on-brand" : "bg-surface text-ink-2 hover:text-ink",
                )}
              >
                {tabLabel(tab.key, tab.label)}
                {tab.open > 0 ? (
                  <span className={cn("ml-1.5 tabular-nums", active ? "text-on-brand" : "text-brand-ink")}>
                    {tab.open}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <dl className="grid grid-cols-3 gap-2 sm:max-w-xl">
        {(
          [
            ["todo", "text-brand-ink"],
            ["check", "text-money"],
            ["done", "text-good"],
          ] as const
        ).map(([lane, color]) => (
          <div key={lane} className="bg-surface rounded-lg px-3 py-2">
            <dt className="text-ink-2 text-xs tracking-wide uppercase">{t(`lane.${lane}`)}</dt>
            <dd className={cn("text-xl font-semibold tabular-nums", page.counts[lane] > 0 ? color : "text-ink-3")}>
              {page.counts[lane]}
            </dd>
          </div>
        ))}
      </dl>

      {page.days.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title={t("emptyTitle")}
          description={
            !page.hasLines ? t("emptyNoLines") : scope.all ? t("emptyDesc") : t("emptyOwn")
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {page.days.map((day) => {
            const quiet = day.items.filter((r) => r.lane === "quiet");
            const shown = day.items.filter((r) => r.lane !== "quiet");
            const label =
              day.key === todayKey ? t("today") : day.key === yesterdayKey ? t("yesterday") : null;
            return (
              <details
                key={day.key}
                open={day.expanded}
                className="group/day bg-surface rounded-2xl"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="font-medium">{label ?? dayHeading(day.key, locale)}</span>
                  {label ? <span className="text-ink-2 text-sm">{dayHeading(day.key, locale)}</span> : null}
                  <span className="text-ink-2 ml-auto text-sm tabular-nums">
                    {day.open > 0 ? (
                      <span className="text-brand-ink font-medium">{t("dayOpen", { n: day.open })} · </span>
                    ) : day.items.length > 0 ? (
                      <span>{t("dayAllHandled")} · </span>
                    ) : null}
                    {t("dayCalls", { n: day.items.length })}
                  </span>
                </summary>
                <ul className="divide-rule border-rule divide-y border-t">
                  {shown.map((row) => (
                    <CallRow
                      key={row.id}
                      row={row}
                      showLine={page.activeTab === "all"}
                      canOpenTickets={canOpenTickets}
                    />
                  ))}
                  {quiet.length > 0 ? (
                    <li>
                      <details className="group/quiet">
                        <summary className="text-ink-3 flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                          {t("quietFold", { n: quiet.length })}
                        </summary>
                        <ul className="divide-rule divide-y">
                          {quiet.map((row) => (
                            <CallRow
                              key={row.id}
                              row={row}
                              showLine={page.activeTab === "all"}
                              canOpenTickets={canOpenTickets}
                            />
                          ))}
                        </ul>
                      </details>
                    </li>
                  ) : null}
                </ul>
              </details>
            );
          })}
        </div>
      )}

      <Link href={earlierHref} className="text-brand-ink self-start text-sm underline underline-offset-2">
        {t("showEarlier")}
      </Link>
    </div>
  );
}
