import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, ExternalLink } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/ui/panel";
import { readHasCapability } from "@/lib/auth/read-session";
import { calendarAdapter, type CalendarEvent } from "@/lib/calendar/client";
import { calendarReady, loadCalendarSettings } from "@/lib/calendar/settings";
import { readCallsScope, scopeAllowsRow } from "@/lib/calls/access";
import { danishDayKey, danishTime, dayHeading } from "@/lib/calls/days";
import { createServiceClient } from "@/lib/supabase/service";
import { cn } from "@/lib/utils";

/** How far each view reaches. A list, not a calendar — Google is the calendar. */
const WINDOW_DAYS = 90;

type Link_ = {
  message_id: string | null;
  ticket_id: string | null;
  /** May THIS viewer open the call — a technician only their own line's. */
  callOpenable: boolean;
};

/**
 * Visits — the service calendar as a READ-ONLY list (owner, 2026-09-30:
 * "just to read"). Read live from the provider through the service account, so
 * it shows what is in Google now — including visits Finn added or moved there —
 * to anyone who may open this page, Google account or not. Changes are made in
 * Google; each visit links there (a link only opens for people the calendar is
 * shared with). A visit the system created also links back to its call, and
 * to its ticket for those who may open tickets.
 */
export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string }>;
}) {
  const { when: rawWhen } = await searchParams;
  const when = rawWhen === "past" ? "past" : "upcoming";
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("visits"),
    getTranslations("common"),
    getLocale(),
  ]);
  const supabase = createServiceClient();
  const settings = await loadCalendarSettings(supabase);
  const adapter = calendarAdapter(settings.provider);
  const [isAdmin, canOpenTickets, callsScope] = await Promise.all([
    readHasCapability("admin"),
    readHasCapability("maintenance"),
    readCallsScope(),
  ]);

  let events: CalendarEvent[] = [];
  let error: string | null = null;
  const links = new Map<string, Link_>();
  if (calendarReady(settings) && adapter) {
    const now = new Date();
    const span = WINDOW_DAYS * 86_400_000;
    const r = await adapter.listEvents(
      settings.calendarId,
      when === "past"
        ? { from: new Date(now.getTime() - span), to: now, newestFirst: true }
        : { from: now, to: new Date(now.getTime() + span) },
    );
    if (r.ok) {
      events = r.value;
      if (events.length > 0) {
        const { data } = await supabase
          .from("calendar_events")
          .select("external_event_id, message_id, ticket_id, inbound_messages(kind, handled_by_person_id)")
          .eq("calendar_id", settings.calendarId)
          .in(
            "external_event_id",
            events.map((e) => e.id),
          );
        for (const row of data ?? []) {
          const call = (Array.isArray(row.inbound_messages) ? row.inbound_messages[0] : row.inbound_messages) as
            | { kind: string | null; handled_by_person_id: string | null }
            | null;
          links.set(row.external_event_id, {
            message_id: row.message_id,
            ticket_id: row.ticket_id,
            // The same rule the Calls page applies, so the link never leads
            // a technician to someone else's call.
            callOpenable: Boolean(call && scopeAllowsRow(callsScope, call)),
          });
        }
      }
    } else {
      error = r.error;
    }
  }

  // Group by Danish day, in list order.
  const days: { key: string; events: CalendarEvent[] }[] = [];
  for (const e of events) {
    const key = e.allDay ? e.start.slice(0, 10) : danishDayKey(e.start);
    const last = days[days.length - 1];
    if (last && last.key === key) last.events.push(e);
    else days.push({ key, events: [e] });
  }

  const tabs = [
    { key: "upcoming", href: "/visits", label: t("upcoming") },
    { key: "past", href: "/visits?when=past", label: t("past") },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
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

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        {calendarReady(settings) ? (
          <a
            href="https://calendar.google.com/calendar/r"
            target="_blank"
            rel="noreferrer"
            className="text-brand-ink inline-flex items-center gap-1 text-sm underline underline-offset-2"
          >
            {t("openGoogle")}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </header>

      {!calendarReady(settings) ? (
        <Panel>
          <EmptyState
            inPanel
            icon={CalendarDays}
            title={t("notSetUpTitle")}
            description={t("notSetUpDesc")}
            action={isAdmin ? { label: t("notSetUpAction"), href: "/admin/settings?section=calendar" } : undefined}
          />
        </Panel>
      ) : (
        <>
          <nav aria-label={t("tabsAria")} className="flex flex-wrap gap-1.5">
            {tabs.map((tab) => {
              const active = tab.key === when;
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-brand text-on-brand" : "bg-surface text-ink-2 hover:text-ink",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {error ? (
            <Panel>
              <p className="text-alert text-sm" role="alert">
                {t("readFailed", { detail: error })}
              </p>
            </Panel>
          ) : days.length === 0 ? (
            <Panel>
              <EmptyState
                inPanel
                icon={CalendarDays}
                title={when === "past" ? t("emptyPast") : t("emptyUpcoming")}
                description={t("emptyDesc", { days: WINDOW_DAYS })}
              />
            </Panel>
          ) : (
            days.map((day) => (
              <Panel key={day.key} title={dayHeading(day.key, locale)} contentClassName="p-0">
                <ul className="divide-rule divide-y">
                  {day.events.map((e) => {
                    const link = links.get(e.id);
                    return (
                      <li key={e.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-4 py-3">
                        <span className="text-ink-2 pt-0.5 text-sm whitespace-nowrap tabular-nums">
                          {e.allDay ? t("allDay") : `${danishTime(e.start)}–${danishTime(e.end)}`}
                        </span>
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="font-medium break-words">{e.title || t("untitled")}</span>
                          {e.location ? <span className="text-ink-2 text-sm break-words">{e.location}</span> : null}
                          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            {e.htmlLink ? (
                              <a
                                href={e.htmlLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-brand-ink inline-flex items-center gap-1 underline underline-offset-2"
                              >
                                {t("openInGoogle")}
                                <ExternalLink className="size-3" aria-hidden />
                              </a>
                            ) : null}
                            {link?.message_id && link.callOpenable ? (
                              <Link href={`/calls/${link.message_id}`} className="text-brand-ink underline underline-offset-2">
                                {t("fromCall")}
                              </Link>
                            ) : null}
                            {link?.ticket_id && canOpenTickets ? (
                              <Link
                                href={`/maintenance/tickets/${link.ticket_id}`}
                                className="text-brand-ink underline underline-offset-2"
                              >
                                {t("ticket")}
                              </Link>
                            ) : null}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ))
          )}
        </>
      )}
    </div>
  );
}
