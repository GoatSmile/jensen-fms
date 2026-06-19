"use client";

import { useState } from "react";

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
  const thisYear = new Date().getUTCFullYear();
  // Seed the week/year inputs from the current date if we have one.
  const seed = date ? isoWeekOf(date) : null;
  const [week, setWeek] = useState<string>(seed ? String(seed.week) : "");
  const [year, setYear] = useState<string>(
    seed ? String(seed.year) : String(thisYear),
  );

  function emitWeek(weekStr: string, yearStr: string) {
    setWeek(weekStr);
    setYear(yearStr);
    const w = Number(weekStr);
    const y = Number(yearStr);
    if (
      Number.isInteger(w) &&
      Number.isInteger(y) &&
      w >= 1 &&
      y >= 2000 &&
      w <= weeksInIsoYear(y)
    ) {
      onChange(mondayOfIsoWeek(y, w), "week");
    } else {
      // Incomplete/invalid week — keep precision but clear the stored date.
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={precision !== "week" ? "default" : "outline"}
          onClick={() => switchTo("exact")}
        >
          Exact date
        </Button>
        <Button
          type="button"
          size="sm"
          variant={precision === "week" ? "default" : "outline"}
          onClick={() => switchTo("week")}
        >
          Week
        </Button>
      </div>

      {precision === "week" ? (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={id ? `${id}-week` : undefined} className="text-muted-foreground text-xs">
              Week
            </label>
            <Input
              id={id ? `${id}-week` : undefined}
              inputMode="numeric"
              value={week}
              onChange={(e) => emitWeek(e.target.value, year)}
              placeholder="28"
              className="w-20"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={id ? `${id}-year` : undefined} className="text-muted-foreground text-xs">
              Year
            </label>
            <Input
              id={id ? `${id}-year` : undefined}
              inputMode="numeric"
              value={year}
              onChange={(e) => emitWeek(week, e.target.value)}
              placeholder={String(thisYear)}
              className="w-24"
            />
          </div>
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
