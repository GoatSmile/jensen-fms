"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ColorSwatch } from "@/components/color-swatch";
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
import { appendField } from "@/lib/forms";

import { createColor, updateColor } from "../_actions/manage-colors";

export type ColorDialogInitial = {
  id: string;
  name_en: string;
  name_da: string;
  slug: string;
  hex: string | null;
  ralCode: string | null;
  sortOrder: number;
  isActive: boolean;
};

type Mode = { kind: "create" } | { kind: "edit"; initial: ColorDialogInitial };

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
};

export function ColorDialog({ open, onOpenChange, mode }: Props) {
  const router = useRouter();
  const initial = mode.kind === "edit" ? mode.initial : null;

  const [nameEn, setNameEn] = useState(initial?.name_en ?? "");
  const [nameDa, setNameDa] = useState(initial?.name_da ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [hex, setHex] = useState(initial?.hex ?? "");
  const [ralCode, setRalCode] = useState(initial?.ralCode ?? "");
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
    appendField(fd, "hex", hex.trim());
    appendField(fd, "ral_code", ralCode.trim());
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
          ? await createColor(fd)
          : await updateColor(mode.initial.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const previewHex = (() => {
    const v = hex.trim();
    if (!v) return null;
    const normalised = v.startsWith("#") ? v : `#${v}`;
    return /^#[0-9a-fA-F]{6}$/.test(normalised) ? normalised : null;
  })();

  const title = mode.kind === "create" ? "Add colour" : "Edit colour";
  const submitLabel = mode.kind === "create" ? "Add" : "Save";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Colours bikes ship in. The English name is what the UI shows
              (operating language is English); Danish is a fallback for
              future i18n.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-name-en">Name (English)</Label>
              <Input
                id="color-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Petrol Blue"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-name-da">Name (Dansk)</Label>
              <Input
                id="color-name-da"
                value={nameDa}
                onChange={(e) => setNameDa(e.target.value)}
                placeholder="(falls back to English if blank)"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="color-slug">Slug</Label>
            <Input
              id="color-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-derived from English name"
              className="font-mono"
            />
            <p className="text-muted-foreground text-xs">
              Stable identifier used in URLs / API. Leave blank to auto-derive.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-hex">Hex</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="color-hex"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  placeholder="#1e4a7a"
                  className="font-mono"
                />
                {previewHex ? (
                  <ColorSwatch hex={previewHex} label={previewHex} />
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                Optional. Used for the colour chip throughout the app.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-ral">RAL code</Label>
              <Input
                id="color-ral"
                value={ralCode}
                onChange={(e) => setRalCode(e.target.value)}
                placeholder="e.g. RAL 5013"
              />
              <p className="text-muted-foreground text-xs">
                Optional. For the painter (Metacoat) to mix consistently.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="color-sort">Sort order</Label>
            <Input
              id="color-sort"
              type="number"
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="max-w-[120px]"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4"
            />
            Active (visible in colour pickers)
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
