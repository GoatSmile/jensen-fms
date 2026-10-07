"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, CalendarPlus, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { addSODeliveryToCalendar } from "../../_actions/calendar-delivery";

const CALENDAR_STATUSES = ["confirmed", "in_production", "ready"];

/**
 * The order's delivery in the calendar: where it already is (put there from
 * this page, or drafted from the call that became this order's offer), or a
 * date, a time and *Add delivery to calendar*. The result is always shown with
 * a link straight to the entry (owner, 2026-10-07).
 */
export function DeliveryCalendar({
  soId,
  status,
  entry,
  defaultDate,
}: {
  soId: string;
  status: string;
  /** The entry already linked to this order or its offer. */
  entry: { eventId: string; startsAt: string | null } | null;
  /** The order's requested delivery date — the prefill. */
  defaultDate: string | null;
}) {
  const t = useTranslations("soDelivery");
  const locale = useLocale();
  const [date, setDate] = useState(defaultDate ?? "");
  const [time, setTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (entry) {
    const when = entry.startsAt
      ? new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Copenhagen",
        }).format(new Date(entry.startsAt))
      : null;
    const past = entry.startsAt !== null && new Date(entry.startsAt) < new Date();
    const q = new URLSearchParams({ event: entry.eventId });
    if (past) q.set("when", "past");
    return (
      <p className="text-good flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Check className="size-4 shrink-0" aria-hidden />
        <span className="font-medium">{when ? t("calendarIn", { when }) : t("calendarInNoTime")}</span>
        <Link
          href={`/calendar?${q.toString()}#ev-${entry.eventId}`}
          className="text-brand-ink inline-flex items-center gap-1 underline underline-offset-2"
        >
          {t("calendarOpen")}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </p>
    );
  }

  if (!CALENDAR_STATUSES.includes(status)) {
    // A draft's date is not agreed yet; a delivered or cancelled one is over.
    return status === "draft" ? (
      <p className="text-muted-foreground text-xs">{t("calendarAfterConfirm")}</p>
    ) : null;
  }

  function add() {
    setError(null);
    start(async () => {
      const r = await addSODeliveryToCalendar(soId, { date, time, durationMinutes: null });
      if (!r.ok) setError(r.error);
      // Success revalidates this page, which then shows the entry above.
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>{t("calendarDate")}</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t("calendarTime")}</span>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
        </label>
        <Button size="sm" variant="outline" onClick={add} disabled={pending || !date}>
          <CalendarPlus aria-hidden />
          {pending ? t("calendarAdding") : t("calendarAdd")}
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
