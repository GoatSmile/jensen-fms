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

import {
  createCustomerSegment,
  updateCustomerSegment,
} from "../_actions/manage-customer-segments";

export type SegmentDialogInitial = {
  id: string;
  name_en: string;
  name_da: string;
  slug: string;
  description_en: string;
  description_da: string;
  sortOrder: number;
  isActive: boolean;
};

type Mode =
  | { kind: "create" }
  | { kind: "edit"; initial: SegmentDialogInitial };

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
};

export function SegmentDialog({ open, onOpenChange, mode }: Props) {
  const router = useRouter();
  const initial = mode.kind === "edit" ? mode.initial : null;

  const [nameEn, setNameEn] = useState(initial?.name_en ?? "");
  const [nameDa, setNameDa] = useState(initial?.name_da ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [descriptionEn, setDescriptionEn] = useState(
    initial?.description_en ?? "",
  );
  const [descriptionDa, setDescriptionDa] = useState(
    initial?.description_da ?? "",
  );
  const [sortOrder, setSortOrder] = useState(
    initial != null ? String(initial.sortOrder) : "100",
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "name_en", nameEn.trim());
    appendField(fd, "name_da", nameDa.trim());
    appendField(fd, "slug", slug.trim());
    appendField(fd, "description_en", descriptionEn.trim());
    appendField(fd, "description_da", descriptionDa.trim());
    appendField(fd, "sort_order", sortOrder.trim());
    if (isActive) fd.set("is_active", "on");
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = buildFormData();
    start(async () => {
      const r =
        mode.kind === "create"
          ? await createCustomerSegment(fd)
          : await updateCustomerSegment(mode.initial.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const title = mode.kind === "create" ? "Add segment" : "Edit segment";
  const submitLabel = mode.kind === "create" ? "Add" : "Save";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Customer segments classify organisations (hotel, hospital,
              municipality, etc.). The English name is what the UI shows;
              Danish is a fallback for future i18n.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seg-name-en">Name (English)</Label>
              <Input
                id="seg-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Hotel"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seg-name-da">Name (Dansk)</Label>
              <Input
                id="seg-name-da"
                value={nameDa}
                onChange={(e) => setNameDa(e.target.value)}
                placeholder="e.g. Hotel"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seg-slug">Slug</Label>
            <Input
              id="seg-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-derived from English name (uses underscores)"
              className="font-mono"
            />
            <p className="text-muted-foreground text-xs">
              Stable identifier. Leave blank to auto-derive from the English
              name.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seg-desc-en">Description (English)</Label>
            <Textarea
              id="seg-desc-en"
              rows={2}
              value={descriptionEn}
              onChange={(e) => setDescriptionEn(e.target.value)}
              placeholder="Optional. Shown as helper text in pickers."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seg-desc-da">Description (Dansk)</Label>
            <Textarea
              id="seg-desc-da"
              rows={2}
              value={descriptionDa}
              onChange={(e) => setDescriptionDa(e.target.value)}
              placeholder="Optional Danish translation."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seg-sort">Sort order</Label>
            <Input
              id="seg-sort"
              type="number"
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="max-w-[120px]"
            />
            <p className="text-muted-foreground text-xs">
              Lower numbers appear first in pickers. Existing segments use 10,
              20, 30…
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4"
            />
            Active (visible in segment pickers)
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
