"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { appendField } from "@/lib/forms";

import { createHsCode, updateHsCode } from "../_actions/manage-hs-codes";

export type HsCodeDialogInitial = {
  id: string;
  code: string;
  description: string;
  tariffPct: number;
  notes: string | null;
  isActive: boolean;
};

type Mode =
  | { kind: "create" }
  | { kind: "edit"; initial: HsCodeDialogInitial };

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
};

export function HsCodeDialog({ open, onOpenChange, mode }: Props) {
  const router = useRouter();
  const initial = mode.kind === "edit" ? mode.initial : null;

  const [code, setCode] = useState(initial?.code ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  // Form holds the percent the user types (e.g. "5" for 5 %); we convert
  // to the decimal the DB stores (0.05) on submit.
  const [tariff, setTariff] = useState(
    initial != null
      ? String(Math.round(initial.tariffPct * 10000) / 100)
      : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function buildFormData(): FormData {
    const pct = Number(tariff.trim().replace(",", "."));
    const decimal = Number.isFinite(pct) ? pct / 100 : NaN;
    const fd = new FormData();
    appendField(fd, "code", code.trim());
    appendField(fd, "description", description.trim());
    // Action expects the DB-side decimal; emit "" when invalid so the
    // server-side validator surfaces a friendly error.
    appendField(fd, "tariff_pct", Number.isFinite(decimal) ? String(decimal) : "");
    appendField(fd, "notes", notes);
    if (isActive) fd.set("is_active", "on");
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const pct = Number(tariff.trim().replace(",", "."));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError("Tariff must be a number between 0 and 100.");
      return;
    }
    const fd = buildFormData();
    start(async () => {
      const r =
        mode.kind === "create"
          ? await createHsCode(fd)
          : await updateHsCode(mode.initial.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const title = mode.kind === "create" ? "Add HS code" : "Edit HS code";
  const submitLabel = mode.kind === "create" ? "Add" : "Save";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              TARIC classification + EU import duty. Tariff is snapshotted onto
              each new PO line — edits here apply to future lines only.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hs-code">Code</Label>
            <Input
              id="hs-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 8714.99.90"
              required
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hs-description">Description</Label>
            <Input
              id="hs-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Bicycle parts and accessories"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hs-tariff">Tariff %</Label>
            <div className="flex items-center gap-2">
              <Input
                id="hs-tariff"
                inputMode="decimal"
                value={tariff}
                onChange={(e) => setTariff(e.target.value)}
                placeholder="5"
                required
              />
              <span className="text-muted-foreground text-sm">%</span>
            </div>
            <p className="text-muted-foreground text-xs">
              EU import duty as a percent — e.g.{" "}
              <span className="font-mono">5</span> for 5 %,{" "}
              <span className="font-mono">10.2</span> for 10.2 %.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hs-notes">Notes</Label>
            <Textarea
              id="hs-notes"
              rows={2}
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — e.g. footnote on rate of return."
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4"
            />
            Active (visible in part pickers)
          </label>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
