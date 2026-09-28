"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import type { ServiceOrderStatus } from "@/lib/services/status";

import { setServiceOrderSchedule } from "../_actions/set-schedule";

/**
 * Drop-off and pickup dates, edited in place and saved on change. The drop-off
 * date drives the automatic move to "at painter", so it is editable only until
 * the goods have left; the pickup date only once they are there.
 */
export function ScheduleDates({
  serviceOrderId,
  status,
  dropOff,
  pickup,
}: {
  serviceOrderId: string;
  status: ServiceOrderStatus;
  dropOff: string | null;
  pickup: string | null;
}) {
  const t = useTranslations("paintOrderDetail");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dropOffEditable = status === "planned" || status === "confirmed";
  const pickupEditable = status === "at_supplier" || status === "ready";

  function save(dates: { dropOff?: string | null; pickup?: string | null }) {
    setError(null);
    start(async () => {
      const r = await setServiceOrderSchedule(serviceOrderId, dates);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase">
            {t("fieldDropOff")}
          </span>
          {dropOffEditable ? (
            <Input
              type="date"
              defaultValue={dropOff ?? ""}
              disabled={pending}
              onChange={(e) => save({ dropOff: e.target.value || null })}
              className="w-44"
            />
          ) : (
            <span>{dropOff ?? "—"}</span>
          )}
          {dropOffEditable ? (
            <span className="text-muted-foreground text-xs">
              {t("dropOffHint")}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase">
            {t("fieldPickup")}
          </span>
          {pickupEditable ? (
            <Input
              type="date"
              defaultValue={pickup ?? ""}
              disabled={pending}
              onChange={(e) => save({ pickup: e.target.value || null })}
              className="w-44"
            />
          ) : (
            <span>{pickup ?? "—"}</span>
          )}
        </label>
      </div>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
