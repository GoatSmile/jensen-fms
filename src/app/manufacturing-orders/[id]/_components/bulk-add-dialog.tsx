"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";

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

import { bulkAddBikesToMO } from "../_actions/bulk-add-bikes";

type Props = {
  moId: string;
  slotsRemaining: number;
  /** Disabled when MO is closed or full. */
  disabled?: boolean;
  disabledReason?: string;
};

export function BulkAddDialog({
  moId,
  slotsRemaining,
  disabled,
  disabledReason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setCount(String(Math.min(slotsRemaining, 10)));
      setError(null);
    }
    setOpen(next);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const n = Number(count);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      setError("Enter a positive whole number.");
      return;
    }
    start(async () => {
      const r = await bulkAddBikesToMO(moId, n);
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
          <Layers aria-hidden /> Bulk add
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Bulk add bikes</DialogTitle>
            <DialogDescription>
              Creates N bikes against this MO with auto-suggested frame numbers.
              Each starts in <em>planning</em> status. {slotsRemaining}{" "}
              {slotsRemaining === 1 ? "slot" : "slots"} remaining before the
              target is reached.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-count">How many bikes?</Label>
            <Input
              id="bulk-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.min(slotsRemaining, 100)}
              step={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              autoFocus
              required
            />
            <p className="text-muted-foreground text-xs">
              Up to {Math.min(slotsRemaining, 100)} per run. Frame numbers are
              suggested using the model&rsquo;s code; you can edit individual
              ones afterward.
            </p>
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
            <Button
              type="submit"
              disabled={isPending || count.trim() === ""}
            >
              {isPending ? "Creating…" : "Create bikes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
