"use client";

import { useState, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";

import { addBikeToMO } from "../_actions/add-bike";

type Props = {
  moId: string;
  /** Pre-filled suggestion the user can override. */
  suggestedFrameNumber: string;
  /** Disabled when the MO is closed (completed/cancelled) or full. */
  disabled?: boolean;
  disabledReason?: string;
};

export function AddBikeDialog({
  moId,
  suggestedFrameNumber,
  disabled,
  disabledReason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [frameNumber, setFrameNumber] = useState(suggestedFrameNumber);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setFrameNumber(suggestedFrameNumber);
      setNotes("");
      setError(null);
      setErrorField(null);
    }
    setOpen(next);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = new FormData();
    fd.append("frame_number", frameNumber);
    fd.append("notes", notes);
    start(async () => {
      const r = await addBikeToMO(moId, fd);
      if (!r.ok) {
        setError(r.error);
        setErrorField(r.field ?? null);
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
            <DialogTitle>Add bike to this MO</DialogTitle>
            <DialogDescription>
              The bike inherits the MO&rsquo;s type, plus its template and
              colour when set. Other identifiers (lock, battery, charger,
              &hellip;) get registered after the bike is created.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-bike-frame">Frame number</Label>
            <Input
              id="add-bike-frame"
              value={frameNumber}
              onChange={(e) => setFrameNumber(e.target.value)}
              className="font-mono"
              required
              autoFocus
            />
            <p className="text-muted-foreground text-xs">
              Suggestion based on the bike type &mdash; override freely.
            </p>
            {errorField === "frame_number" && error ? (
              <p className="text-destructive text-xs" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-bike-notes">Notes</Label>
            <Textarea
              id="add-bike-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional internal notes."
            />
          </div>

          {error && !errorField ? (
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
              disabled={isPending || frameNumber.trim() === ""}
            >
              {isPending ? "Saving…" : "Add bike"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
