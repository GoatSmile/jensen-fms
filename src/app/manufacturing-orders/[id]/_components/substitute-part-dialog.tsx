"use client";

import { useMemo, useState, useTransition } from "react";
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

import {
  addMOPart,
  substituteMOPart,
} from "../_actions/manage-mo-parts";

export type PartChoice = {
  id: string;
  internal_sku: string;
  name_en: string;
  category_name: string | null;
};

type Mode =
  | { kind: "add" }
  | {
      kind: "substitute";
      originalRowId: string;
      originalPartName: string;
      originalQty: number;
    };

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  moId: string;
  mode: Mode;
  parts: PartChoice[];
  /** Already-on-MO part ids to disable in the picker. */
  excludeIds: Set<string>;
};

export function SubstitutePartDialog({
  open,
  onOpenChange,
  moId,
  mode,
  parts,
  excludeIds,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [partId, setPartId] = useState<string>("");
  const [qty, setQty] = useState(
    mode.kind === "substitute" ? String(mode.originalQty) : "1",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) =>
      [p.internal_sku, p.name_en, p.category_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [parts, filter]);

  function reset() {
    setFilter("");
    setPartId("");
    setQty(mode.kind === "substitute" ? String(mode.originalQty) : "1");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const qtyN = Number(qty);
    if (!partId) {
      setError("Pick a replacement part.");
      return;
    }
    if (!Number.isFinite(qtyN) || qtyN <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }
    start(async () => {
      const result =
        mode.kind === "add"
          ? await addMOPart(moId, partId, qtyN)
          : await substituteMOPart(moId, mode.originalRowId, partId, qtyN);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
    });
  }

  const title =
    mode.kind === "substitute"
      ? `Substitute ${mode.originalPartName}`
      : "Add part to MO";
  const submitLabel =
    mode.kind === "substitute" ? "Substitute" : "Add part";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {mode.kind === "substitute"
                ? "The original row will be removed and the replacement added with origin = substituted."
                : "Add a part to this MO with origin = added. Use Substitute on an existing row instead if you're swapping a templated part."}
            </DialogDescription>
          </DialogHeader>

          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter parts by SKU, name, category…"
          />

          <div className="max-h-72 overflow-y-auto rounded-md border">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground p-3 text-center text-sm">
                No parts match.
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map((p) => {
                  const disabled = excludeIds.has(p.id);
                  const isPicked = partId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setPartId(p.id)}
                        disabled={disabled}
                        className={`hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                          isPicked ? "bg-muted" : ""
                        }`}
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
                            already on MO
                          </span>
                        ) : isPicked ? (
                          <span className="text-emerald-700 dark:text-emerald-400 text-xs">
                            selected
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mo-part-qty">Qty per bike</Label>
            <Input
              id="mo-part-qty"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-[120px]"
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
            <Button
              type="submit"
              disabled={isPending || !partId || qty.trim() === ""}
            >
              {isPending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
