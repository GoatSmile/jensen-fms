"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, MapPin, Phone, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedId } from "@/components/segmented-id";

import {
  markPaintDroppedOff,
  markPaintPickedUp,
  markPaintReady,
  movePaintDropOff,
  setPaintPickup,
  type PaintRunResult,
} from "../_actions/paint-run";

export type PaintRun = {
  id: string;
  orderNumber: string;
  status: "confirmed" | "at_supplier" | "ready";
  dropOff: string | null;
  pickup: string | null;
  supplier: string;
  supplierAddress: string | null;
  supplierPhone: string | null;
  salesOrder: string | null;
  bikeCount: number;
  lines: { what: string; colour: string | null; quantity: number }[];
};

/**
 * One paint run on Finn's phone: where, what is in the boxes, and the one or
 * two buttons the drive needs. Collecting is two-tap (it books painted
 * stock), like *Mark done* on a work order.
 */
export function PaintRunCard({ run }: { run: PaintRun }) {
  const t = useTranslations("paintRuns");
  const tStatus = useTranslations("serviceOrderStatus");
  const [error, setError] = useState<string | null>(null);
  const [confirmPickup, setConfirmPickup] = useState(false);
  const [pending, start] = useTransition();

  function run_(fn: () => Promise<PaintRunResult>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      setConfirmPickup(false);
    });
  }

  return (
    <div className="bg-card flex flex-col gap-3 rounded-lg border p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SegmentedId value={run.orderNumber} className="text-muted-foreground text-xs" />
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              run.status === "ready"
                ? "bg-good-wash text-good"
                : run.status === "at_supplier"
                  ? "bg-money-wash text-money"
                  : "bg-brand-wash text-brand"
            }`}
          >
            {tStatus(run.status)}
          </span>
        </div>
        {run.salesOrder ? (
          <span className="text-muted-foreground font-mono text-xs">{run.salesOrder}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">{run.supplier}</span>
        {run.supplierAddress ? (
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <MapPin className="size-3.5" aria-hidden /> {run.supplierAddress}
          </span>
        ) : null}
        {run.supplierPhone ? (
          <a
            href={`tel:${run.supplierPhone.replace(/\s+/g, "")}`}
            className="text-brand flex items-center gap-1 text-sm"
          >
            <Phone className="size-3.5" aria-hidden /> {run.supplierPhone}
          </a>
        ) : null}
      </div>

      {run.lines.length > 0 ? (
        <ul className="bg-ground divide-rule divide-y rounded-md px-3 text-sm">
          {run.lines.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
              <span>
                {l.what}
                {l.colour ? (
                  <span className="text-muted-foreground"> · {l.colour}</span>
                ) : null}
              </span>
              <span className="tabular-nums">× {l.quantity}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {run.bikeCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("bikes", { count: run.bikeCount })}
        </p>
      ) : null}

      {run.status === "confirmed" ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t("dropOffDate")}</span>
            <Input
              type="date"
              defaultValue={run.dropOff ?? ""}
              disabled={pending}
              onChange={(e) =>
                run_(() => movePaintDropOff(run.id, e.target.value))
              }
              className="h-10 w-44"
            />
          </label>
          <p className="text-muted-foreground text-xs">{t("dropOffAuto")}</p>
          <Button
            size="lg"
            className="h-12"
            disabled={pending}
            onClick={() => run_(() => markPaintDroppedOff(run.id))}
          >
            <Truck className="size-5" aria-hidden /> {t("droppedOffNow")}
          </Button>
        </div>
      ) : null}

      {run.status === "at_supplier" ? (
        <Button
          size="lg"
          variant="outline"
          className="h-12"
          disabled={pending}
          onClick={() => run_(() => markPaintReady(run.id, null))}
        >
          {t("markReady")}
        </Button>
      ) : null}

      {run.status === "at_supplier" || run.status === "ready" ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t("pickupDate")}</span>
            <Input
              type="date"
              defaultValue={run.pickup ?? ""}
              disabled={pending}
              onChange={(e) => run_(() => setPaintPickup(run.id, e.target.value))}
              className="h-10 w-44"
            />
          </label>
          {confirmPickup ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t("pickedUpConfirm")}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex-1"
                  onClick={() => setConfirmPickup(false)}
                  disabled={pending}
                >
                  {t("cancel")}
                </Button>
                <Button
                  className="bg-good text-on-good hover:bg-good h-12 flex-1 font-semibold"
                  onClick={() => run_(() => markPaintPickedUp(run.id))}
                  disabled={pending}
                >
                  <CheckCircle2 className="size-5" aria-hidden /> {t("pickedUpYes")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="lg"
              className="bg-good text-on-good hover:bg-good h-12 font-semibold"
              disabled={pending}
              onClick={() => setConfirmPickup(true)}
            >
              <CheckCircle2 className="size-5" aria-hidden /> {t("pickedUp")}
            </Button>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="text-alert text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
