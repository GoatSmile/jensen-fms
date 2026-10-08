"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, CalendarClock, CalendarPlus, CalendarX, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { addSODeliveryToCalendar, moveSODelivery, removeSODelivery } from "../../_actions/calendar-delivery";

const CALENDAR_STATUSES = ["confirmed", "in_production", "ready"];

/**
 * The order's delivery in the calendar: where it already is (put there from
 * this page, or drafted from the call that became this order's offer), or a
 * date, a time and *Add delivery to calendar*. The result is always shown with
 * a link straight to the entry (owner, 2026-10-07). An entry can be MOVED (its
 * current day and time prefilled, read live from the calendar) or REMOVED
 * (asked once) — removing brings *Add* back.
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
  entry: { eventId: string; start: string | null; allDay: boolean } | null;
  /** The order's requested delivery date — the prefill. */
  defaultDate: string | null;
}) {
  const t = useTranslations("soDelivery");
  const locale = useLocale();
  const [date, setDate] = useState(defaultDate ?? "");
  const [time, setTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"show" | "move" | "remove">("show");
  // The entry's own day and time, on Danish time — the Move form's prefill.
  const current = entry?.start ? danishParts(entry.start, entry.allDay) : null;
  const [moveDate, setMoveDate] = useState(current?.date ?? "");
  const [moveTime, setMoveTime] = useState(current?.time ?? "");

  if (entry) {
    const when = entry.start
      ? new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          ...(entry.allDay
            ? { timeZone: "UTC" }
            : { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" }),
        }).format(new Date(entry.allDay ? `${entry.start}T12:00:00Z` : entry.start))
      : null;
    const past = entry.start !== null && new Date(entry.start) < new Date();
    const q = new URLSearchParams({ event: entry.eventId });
    if (past) q.set("when", "past");
    const canMove = CALENDAR_STATUSES.includes(status);
    const canRemove = canMove || status === "cancelled";

    const move = () => {
      setError(null);
      start(async () => {
        const r = await moveSODelivery(soId, { date: moveDate, time: moveTime });
        if (!r.ok) return setError(r.error);
        setMode("show");
      });
    };
    const remove = () => {
      setError(null);
      start(async () => {
        const r = await removeSODelivery(soId);
        if (!r.ok) return setError(r.error);
        setMode("show");
      });
    };

    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Check className="text-good size-4 shrink-0" aria-hidden />
          <span className="text-good font-medium">{when ? t("calendarIn", { when }) : t("calendarInNoTime")}</span>
          <Link
            href={`/calendar?${q.toString()}#ev-${entry.eventId}`}
            className="text-brand-ink inline-flex items-center gap-1 underline underline-offset-2"
          >
            {t("calendarOpen")}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          {mode === "show" && (canMove || canRemove) ? (
            <span className="ml-auto flex gap-1">
              {canMove ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // Start from where the entry IS now, not a value typed earlier.
                    setMoveDate(current?.date ?? "");
                    setMoveTime(current?.time ?? "");
                    setMode("move");
                  }}
                  disabled={pending}
                >
                  <CalendarClock aria-hidden />
                  {t("calendarMove")}
                </Button>
              ) : null}
              {canRemove ? (
                <Button size="sm" variant="ghost" onClick={() => setMode("remove")} disabled={pending}>
                  <CalendarX aria-hidden />
                  {t("calendarRemove")}
                </Button>
              ) : null}
            </span>
          ) : null}
        </div>

        {mode === "move" ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("calendarDate")}</span>
              <Input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} className="w-40" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("calendarTime")}</span>
              <Input type="time" value={moveTime} onChange={(e) => setMoveTime(e.target.value)} className="w-28" />
            </label>
            <Button size="sm" onClick={move} disabled={pending || !moveDate}>
              {pending ? t("calendarMoving") : t("calendarMoveSave")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("show")} disabled={pending}>
              {t("calendarCancel")}
            </Button>
          </div>
        ) : null}

        {mode === "remove" ? (
          <div className="bg-ground flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm">
            <span>{t("calendarRemoveConfirm")}</span>
            <Button size="sm" variant="destructive" onClick={remove} disabled={pending}>
              {pending ? t("calendarRemoving") : t("calendarRemove")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("show")} disabled={pending}>
              {t("calendarCancel")}
            </Button>
          </div>
        ) : null}

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
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

/** "2026-10-12T09:00:00+02:00" → { date: "2026-10-12", time: "09:00" } on Danish time; all-day → no time. */
function danishParts(start: string, allDay: boolean): { date: string; time: string } {
  if (allDay) return { date: start.slice(0, 10), time: "" };
  const d = new Date(start);
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(d);
  const time = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Copenhagen",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return { date, time };
}
