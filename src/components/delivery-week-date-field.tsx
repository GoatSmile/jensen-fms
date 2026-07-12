"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type DeliveryPrecision,
  isoWeekOf,
  mondayOfIsoWeek,
  weeksInIsoYear,
} from "@/lib/iso-week";

type Props = {
  id?: string;
  /** "YYYY-MM-DD" or "". When precision is "week" this is the Monday. */
  date: string;
  precision: DeliveryPrecision;
  onChange: (date: string, precision: DeliveryPrecision) => void;
};

/**
 * Delivery target input that toggles between an exact date and an ISO week.
 * In week mode the user picks a week number + year; the field emits the
 * Monday of that week as the date (single source of truth) plus
 * precision="week" so display code can render "week 28 2026". Switching modes
 * keeps the underlying date so nothing is lost.
 */
export function DeliveryWeekDateField({ id, date, precision, onChange }: Props) {
  const t = useTranslations("deliveryWeek");
  const thisYear = new Date().getUTCFullYear();
  // Seed the week/year inputs from the current date if we have one.
  const seed = date ? isoWeekOf(date) : null;
  const [week, setWeek] = useState<string>(seed ? String(seed.week) : "");
  const [year, setYear] = useState<string>(
    seed ? String(seed.year) : String(thisYear),
  );

  function emitWeek(weekStrRaw: string, yearStr: string) {
    const yNum = Number(yearStr);
    const effYear = Number.isInteger(yNum) && yNum >= 2000 ? yNum : thisYear;
    const maxWeek = weeksInIsoYear(effYear);

    // Clamp a non-empty week into [1, maxWeek] so an out-of-range week (e.g. 60,
    // or 53 in a 52-week year) simply can't be entered. Empty stays empty —
    // delivery is optional, so no week = no stored date.
    let weekStr = weekStrRaw;
    if (weekStrRaw.trim() !== "") {
      const w = Math.floor(Number(weekStrRaw));
      if (Number.isFinite(w)) {
        weekStr = String(Math.min(maxWeek, Math.max(1, w)));
      }
    }

    setWeek(weekStr);
    setYear(yearStr);

    const w = Number(weekStr);
    if (
      Number.isInteger(w) &&
      w >= 1 &&
      w <= maxWeek &&
      Number.isInteger(yNum) &&
      yNum >= 2000
    ) {
      onChange(mondayOfIsoWeek(effYear, w), "week");
    } else {
      // Incomplete/invalid (e.g. blank week or year) — keep precision but
      // clear the stored date so nothing out-of-range is ever saved.
      onChange("", "week");
    }
  }

  function switchTo(next: DeliveryPrecision) {
    if (next === precision) return;
    if (next === "week") {
      const s = date ? isoWeekOf(date) : null;
      const weekStr = s ? String(s.week) : week;
      const yearStr = s ? String(s.year) : year || String(thisYear);
      emitWeek(weekStr, yearStr);
    } else {
      onChange(date, "exact");
    }
  }

  // Valid week range for the currently-entered year (52 or 53), for the input
  // bounds + the helper hint.
  const yNumNow = Number(year);
  const effYearNow =
    Number.isInteger(yNumNow) && yNumNow >= 2000 ? yNumNow : thisYear;
  const maxWeekNow = weeksInIsoYear(effYearNow);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={precision !== "week" ? "default" : "outline"}
          onClick={() => switchTo("exact")}
        >
          {t("exactDate")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={precision === "week" ? "default" : "outline"}
          onClick={() => switchTo("week")}
        >
          {t("week")}
        </Button>
      </div>

      {precision === "week" ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={id ? `${id}-week` : undefined} className="text-muted-foreground text-xs">
                {t("week")}
              </label>
              <Input
                id={id ? `${id}-week` : undefined}
                type="number"
                inputMode="numeric"
                min={1}
                max={maxWeekNow}
                value={week}
                onChange={(e) => emitWeek(e.target.value, year)}
                placeholder="28"
                className="w-20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={id ? `${id}-year` : undefined} className="text-muted-foreground text-xs">
                {t("year")}
              </label>
              <Input
                id={id ? `${id}-year` : undefined}
                type="number"
                inputMode="numeric"
                min={thisYear}
                value={year}
                onChange={(e) => emitWeek(week, e.target.value)}
                placeholder={String(thisYear)}
                className="w-24"
              />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            {t("weekRange", { max: maxWeekNow, year: effYearNow })}
          </p>
        </div>
      ) : (
        <Input
          id={id}
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value, "exact")}
        />
      )}
    </div>
  );
}
