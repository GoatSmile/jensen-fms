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

import { addBikeToPaintOrder } from "../_actions/add-bike-to-paint";

export type EligibleBikeOption = {
  id: string;
  frameNumber: string;
  templateLabel: string | null;
};

type Props = {
  serviceOrderId: string;
  bikes: EligibleBikeOption[];
  disabled?: boolean;
  disabledReason?: string;
};

export function AddBikeToPaintDialog({
  serviceOrderId,
  bikes,
  disabled,
  disabledReason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [bikeId, setBikeId] = useState("");
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
      const r = await addBikeToPaintOrder(serviceOrderId, bikeId, { notes });
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
            <DialogTitle>Add bike to this order</DialogTitle>
            <DialogDescription>
              The bike ships with this batch and is blocked from building
              while the order is out. Bikes already in an open order are not
              shown. What gets painted is set on the item lines.
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paint-bike-notes">Notes</Label>
            <Textarea
              id="paint-bike-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — anything specific to this bike."
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
