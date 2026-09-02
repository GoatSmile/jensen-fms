"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BIKE_STATUS_VARIANT, type BikeStatus } from "@/lib/bikes/status";

import { addBikesToPaintOrder } from "../_actions/add-bike-to-paint";

export type EligibleBikeOption = {
  id: string;
  frameNumber: string;
  templateLabel: string | null;
  status: BikeStatus;
  /** The MO the bike is being built on; null for a bike recorded without one. */
  moNumber: string | null;
  /** The customer order behind that MO; null for a stock build. */
  soId: string | null;
  soNumber: string | null;
  /** The SO's customer, else the bike's slated owner. */
  customerName: string | null;
};

type Props = {
  serviceOrderId: string;
  bikes: EligibleBikeOption[];
  disabled?: boolean;
  disabledReason?: string;
};

type Group = {
  key: string;
  kind: "so" | "stock" | "none";
  label: string;
  sublabel: string | null;
  bikes: EligibleBikeOption[];
};

const MAX_ROWS = 200;

/**
 * Pick the bikes that ship with this batch. Bikes are grouped by the order
 * they belong to — a customer's frames go to the painter together, and the
 * person doing this knows the customer or the order number, rarely the frame
 * number (2026-09-02: the previous frame-number-only picker is why the SO →
 * paint link went unfound). Search matches frame, model, customer, SO and MO.
 */
export function AddBikeToPaintDialog({
  serviceOrderId,
  bikes,
  disabled,
  disabledReason,
}: Props) {
  const t = useTranslations("paintOrderDetail");
  const tCommon = useTranslations("common");
  const tBikeStatus = useTranslations("bikeStatus");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const groups = useMemo<Group[]>(() => {
    const needle = q.trim().toLowerCase();
    const matches = needle
      ? bikes.filter((b) =>
          [b.frameNumber, b.templateLabel, b.customerName, b.soNumber, b.moNumber]
            .filter((s): s is string => Boolean(s))
            .some((s) => s.toLowerCase().includes(needle)),
        )
      : bikes;

    const byKey = new Map<string, Group>();
    for (const b of matches.slice(0, MAX_ROWS)) {
      let key: string;
      let kind: Group["kind"];
      let label: string;
      let sublabel: string | null = null;
      if (b.soId) {
        key = `so:${b.soId}`;
        kind = "so";
        label = b.soNumber ?? "SO";
        sublabel = b.customerName;
      } else if (b.moNumber) {
        key = `mo:${b.moNumber}`;
        kind = "stock";
        label = b.moNumber;
        sublabel = t("groupStockBuild");
      } else {
        key = "none";
        kind = "none";
        label = t("groupNoOrder");
        sublabel = b.customerName;
      }
      const g = byKey.get(key) ?? { key, kind, label, sublabel, bikes: [] };
      g.bikes.push(b);
      byKey.set(key, g);
    }
    const order: Record<Group["kind"], number> = { so: 0, stock: 1, none: 2 };
    return [...byKey.values()].sort(
      (a, b) =>
        order[a.kind] - order[b.kind] || b.label.localeCompare(a.label),
    );
  }, [bikes, q, t]);

  function reset() {
    setQ("");
    setSelected(new Set());
    setNotes("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (next) reset();
    setOpen(next);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setGroup(g: Group, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const b of g.bikes) {
        if (on) next.add(b.id);
        else next.delete(b.id);
      }
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError(t("errPickBike"));
      return;
    }
    start(async () => {
      const r = await addBikesToPaintOrder(serviceOrderId, [...selected], {
        notes,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          <Plus aria-hidden /> {t("addBike")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("addBikeTitle")}</DialogTitle>
            <DialogDescription>{t("addBikeDesc")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-bike-search">{t("findBike")}</Label>
            <Input
              id="paint-bike-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("findBikePlaceholder")}
              autoFocus
            />
          </div>

          {/* The scroller sits on the list itself — it is the thing that overflows. */}
          <div className="bg-ground max-h-80 overflow-y-auto rounded-lg">
            {groups.length === 0 ? (
              <p className="text-ink-3 p-4 text-center text-sm">
                {t("noBikesMatch")}
              </p>
            ) : (
              groups.map((g) => {
                const allOn = g.bikes.every((b) => selected.has(b.id));
                return (
                  <div key={g.key} className="border-rule border-b last:border-b-0">
                    <div className="flex items-center justify-between gap-3 px-3 pt-2.5 pb-1">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          <span className={g.kind === "none" ? "" : "font-mono"}>
                            {g.label}
                          </span>
                          {g.sublabel ? (
                            <span className="text-ink-2 ml-2 font-sans font-normal">
                              {g.sublabel}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-ink-3 text-xs">
                          {t("groupBikes", { count: g.bikes.length })}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setGroup(g, !allOn)}
                      >
                        {allOn ? t("clearGroup") : t("selectGroup")}
                      </Button>
                    </div>
                    <ul>
                      {g.bikes.map((b) => {
                        const checked = selected.has(b.id);
                        return (
                          <li key={b.id}>
                            <label className="hover:bg-surface flex cursor-pointer items-center gap-3 px-3 py-1.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(b.id)}
                                className="size-4 shrink-0 accent-primary"
                              />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="font-mono text-sm">
                                  {b.frameNumber}
                                </span>
                                {b.templateLabel ? (
                                  <span className="text-ink-2 truncate text-xs">
                                    {b.templateLabel}
                                  </span>
                                ) : null}
                              </span>
                              <Badge
                                variant={BIKE_STATUS_VARIANT[b.status] ?? "outline"}
                              >
                                {tBikeStatus.has(b.status)
                                  ? tBikeStatus(b.status)
                                  : b.status}
                              </Badge>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-bike-notes">{t("notes")}</Label>
            <Textarea
              id="paint-bike-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("addBikeNotesPlaceholder")}
            />
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending || selected.size === 0}>
              {isPending ? t("adding") : t("addBikes", { count: selected.size })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
