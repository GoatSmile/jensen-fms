"use client";

import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PartOption = {
  id: string;
  internal_sku: string;
  name_en: string;
  category_name: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parts: PartOption[];
  /** Already-selected part ids — disabled in the picker so they can't be added twice. */
  excludeIds: Set<string>;
  onPick: (partId: string) => void;
};

export function PartPickerDialog({
  open,
  onOpenChange,
  parts,
  excludeIds,
  onPick,
}: Props) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) => {
      const hay = [
        p.internal_sku,
        p.name_en,
        p.category_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [parts, filter]);

  function pick(id: string) {
    onPick(id);
    onOpenChange(false);
    setFilter("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add part to recipe</DialogTitle>
          <DialogDescription>
            Search by SKU, name, or category. Parts already in the recipe are
            disabled.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter parts…"
            autoFocus
          />

          <div className="max-h-80 overflow-y-auto rounded-md border">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground p-4 text-center text-sm">
                No parts match.
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map((p) => {
                  const disabled = excludeIds.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pick(p.id)}
                        disabled={disabled}
                        className="hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{p.name_en}</span>
                          <span className="text-muted-foreground font-mono text-xs">
                            {p.internal_sku}
                            {p.category_name ? (
                              <span className="ml-2">· {p.category_name}</span>
                            ) : null}
                          </span>
                        </div>
                        {disabled ? (
                          <span className="text-muted-foreground text-xs">
                            already in recipe
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
