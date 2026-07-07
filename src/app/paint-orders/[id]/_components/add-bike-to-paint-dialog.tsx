"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ColorSwatch } from "@/components/color-swatch";
import { colorFinishLabel } from "@/lib/colors/coating";
import type { ColorOption } from "@/app/paint-orders/_components/paint-order-form";
import { PAINT_SCOPES, paintScopeLabel, paintScopeParts } from "@/lib/paint/scope";

import { addBikeToPaintOrder } from "../_actions/add-bike-to-paint";

export type EligibleBikeOption = {
  id: string;
  frameNumber: string;
  templateLabel: string | null;
};

type Props = {
  paintOrderId: string;
  bikes: EligibleBikeOption[];
  colors: ColorOption[];
  /** Order's batch-default colour, pre-selected for each new frame. */
  defaultColorId: string | null;
  disabled?: boolean;
  disabledReason?: string;
};

export function AddBikeToPaintDialog({
  paintOrderId,
  bikes,
  colors,
  defaultColorId,
  disabled,
  disabledReason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [bikeId, setBikeId] = useState("");
  const [colorId, setColorId] = useState(defaultColorId ?? "");
  const [scope, setScope] = useState<string>("std");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return bikes.slice(0, 100);
    return bikes
      .filter(
        (b) =>
          b.frameNumber.toLowerCase().includes(needle) ||
          (b.templateLabel?.toLowerCase().includes(needle) ?? false),
      )
      .slice(0, 100);
  }, [bikes, q]);

  function reset() {
    setQ("");
    setBikeId("");
    setColorId(defaultColorId ?? "");
    setScope("std");
    setNotes("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (next) reset();
    setOpen(next);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!bikeId) {
      setError("Pick a bike.");
      return;
    }
    start(async () => {
      const r = await addBikeToPaintOrder(paintOrderId, bikeId, {
        colorId: colorId || null,
        scope,
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
          <Plus aria-hidden /> Add bike
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add bike to this paint order</DialogTitle>
            <DialogDescription>
              Pick the frame, its colour and what gets painted. Bikes already in
              an open paint order are not shown.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-bike-search">Find bike</Label>
            <Input
              id="paint-bike-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Frame number or template…"
              className="font-mono"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-bike-pick">Bike</Label>
            <Select value={bikeId} onValueChange={setBikeId}>
              <SelectTrigger id="paint-bike-pick">
                <SelectValue placeholder="Pick a bike…" />
              </SelectTrigger>
              <SelectContent>
                {filtered.length === 0 ? (
                  <div className="text-muted-foreground p-2 text-xs">
                    No bikes match.
                  </div>
                ) : (
                  filtered.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="font-mono">{b.frameNumber}</span>
                      {b.templateLabel ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {b.templateLabel}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paint-bike-color">Colour</Label>
              <Select value={colorId} onValueChange={setColorId}>
                <SelectTrigger id="paint-bike-color">
                  <SelectValue placeholder="Batch default" />
                </SelectTrigger>
                <SelectContent>
                  {colors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <ColorSwatch hex={c.hex} label={c.name_en} />
                      {c.name_en}
                      {colorFinishLabel(c.ral_code, c.coating) ? (
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          {colorFinishLabel(c.ral_code, c.coating)}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paint-bike-scope">Paints</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="paint-bike-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAINT_SCOPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {paintScopeLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-muted-foreground -mt-1 text-xs">
            {paintScopeParts(scope)}
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-bike-notes">Notes</Label>
            <Textarea
              id="paint-bike-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — anything specific to this bike's paint job."
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
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || bikeId === ""}>
              {isPending ? "Adding…" : "Add bike"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
