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
import { CALENDAR_KINDS, CALENDAR_KIND_SPECS, isCalendarKind } from "@/lib/calendar/kinds";
import { calendarReady, loadCalendarSettings } from "@/lib/calendar/settings";
import { readCallsScope, scopeAllowsRow } from "@/lib/calls/access";
import { danishDayKey, danishTime, dayHeading } from "@/lib/calls/days";
import { createServiceClient } from "@/lib/supabase/service";
import { cn } from "@/lib/utils";

/** Kind colours, from the six-hue vocabulary (the kind's `hue`). */
const KIND_PILL = {
  brand: "bg-brand-wash text-brand-ink",
  money: "bg-money-wash text-money",
} as const;

/** How far each view reaches. A list, not a calendar — Google is the calendar. */
const WINDOW_DAYS = 90;

type Link_ = {
  message_id: string | null;
  ticket_id: string | null;
  /** May THIS viewer open the call — a technician only their own line's. */
  callOpenable: boolean;
  /** The kind the system made it as — for entries written before the kind rode on the event. */
  kind: string | null;
  /** Its source was a dictated command, not a call — a different page. */
  fromCommand: boolean;
};

/**
 * Calendar — the service calendar as a READ-ONLY list (owner, 2026-09-30:
 * "just to read"; renamed from Visits 2026-10-01, because it holds reminders
 * and other entries too). Each entry the system made carries its KIND
 * (`src/lib/calendar/kinds.ts`); one added in Google reads as "other". Read live from the provider through the service account, so
 * it shows what is in Google now — including visits Finn added or moved there —
 * to anyone who may open this page, Google account or not. Changes are made in
 * Google; each visit links there (a link only opens for people the calendar is
 * shared with). A visit the system created also links back to its call, and
 * to its ticket for those who may open tickets.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string; kind?: string }>;
}) {
  const { when: rawWhen, kind: rawKind } = await searchParams;
  const when = rawWhen === "past" ? "past" : "upcoming";
  // ?kind= narrows the list: a kind, or "other" for entries made in Google.
  const kindFilter = isCalendarKind(rawKind) || rawKind === "other" ? rawKind : null;
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("calendar"),
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
          .select("external_event_id, message_id, ticket_id, kind, inbound_messages(kind, handled_by_person_id)")
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
            kind: row.kind,
            fromCommand: call?.kind === "command",
          });
        }
      }
    } else {
      error = r.error;
    }
  }

  // The kind rides on the event; the link row fills in for older entries.
  events = events.map((e) => {
    const linked = links.get(e.id)?.kind;
    return e.kind || !isCalendarKind(linked) ? e : { ...e, kind: linked };
  });
  if (kindFilter) {
    events = events.filter((e) => (kindFilter === "other" ? e.kind === null : e.kind === kindFilter));
  }

  // Group by Danish day, in list order.
  const days: { key: string; events: CalendarEvent[] }[] = [];
  for (const e of events) {
    const key = e.allDay ? e.start.slice(0, 10) : danishDayKey(e.start);
    const last = days[days.length - 1];
    if (last && last.key === key) last.events.push(e);
    else days.push({ key, events: [e] });
  }

  // Links keep the other filter, so switching one never drops the other.
  const href = (next: { when?: string; kind?: string | null }) => {
    const q = new URLSearchParams();
    const w = next.when ?? when;
    const k = next.kind === undefined ? kindFilter : next.kind;
    if (w === "past") q.set("when", "past");
    if (k) q.set("kind", k);
    const qs = q.toString();
    return qs ? `/calendar?${qs}` : "/calendar";
  };
  const tabs = [
    { key: "upcoming", href: href({ when: "upcoming" }), label: t("upcoming") },
    { key: "past", href: href({ when: "past" }), label: t("past") },
  ];
  const kindChips: { key: string | null; label: string }[] = [
    { key: null, label: t("kindAll") },
    ...CALENDAR_KINDS.map((k) => ({ key: k as string, label: t(`kind_${k}`) })),
    { key: "other", label: t("kind_other") },
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

          <nav aria-label={t("kindsAria")} className="-mt-3 flex flex-wrap gap-1.5">
            {kindChips.map((chip) => {
              const active = chip.key === kindFilter;
              return (
                <Link
                  key={chip.key ?? "all"}
                  href={href({ kind: chip.key })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    active ? "border-brand text-brand-ink bg-brand-wash" : "border-rule text-ink-2 hover:text-ink",
                  )}
                >
                  {chip.label}
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
                          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                                e.kind ? KIND_PILL[CALENDAR_KIND_SPECS[e.kind].hue] : "bg-ground text-ink-2",
                              )}
                            >
                              {t(`kind_${e.kind ?? "other"}`)}
                            </span>
                            <span className="font-medium break-words">{e.title || t("untitled")}</span>
                          </span>
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
                              <Link
                                href={`/${link.fromCommand ? "commands" : "calls"}/${link.message_id}`}
                                className="text-brand-ink underline underline-offset-2"
                              >
                                {link.fromCommand ? t("fromCommand") : t("fromCall")}
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
