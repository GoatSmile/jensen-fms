"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ChecklistPart = {
  id: string;
  sku: string;
  name: string;
  /** Right-aligned hint in the option row — retail price, on-hand, etc. */
  meta?: string | null;
  /** Tint the meta destructive (e.g. zero stock). */
  metaDanger?: boolean;
};

type Props = {
  index: number;
  label: string;
  parts: ChecklistPart[];
  /** Part ids already in the recipe — green-washed + disabled in the picker. */
  addedIds: Set<string>;
  /** Recipe rows currently in this category — drives the done state. */
  pickedCount: number;
  selectValue: string;
  onSelectValue: (v: string) => void;
  onPick: (partId: string, quantity: number) => void;
  disabled: boolean;
};

/**
 * One category line of the recipe checklist: name + picked counter left,
 * part picker right. Turns green with a check once the category has at
 * least one part in the recipe, so the builder scans down and sees what's
 * handled. Shared by the bike-template editor and the MO parts editor —
 * the data source and write model differ, the muscle memory shouldn't.
 */
export function CategoryChecklistRow({
  index,
  label,
  parts,
  addedIds,
  pickedCount,
  selectValue,
  onSelectValue,
  onPick,
  disabled,
}: Props) {
  const totalCount = parts.length;
  const remaining = parts.filter((p) => !addedIds.has(p.id)).length;
  const done = pickedCount > 0;

  // Quantity to add with the next pick. Defaults to 1, resets after each pick.
  // Tolerates partial input; coerced to a whole number ≥ 1 at pick time.
  const [qtyText, setQtyText] = useState("1");
  const pickQty = Math.max(1, Math.floor(Number(qtyText)) || 1);
  const pickDisabled = disabled || remaining === 0;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-md border px-2.5 py-1.5 transition-colors ${
        done
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-500/10"
          : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {done ? (
          <Check
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-label="Category has parts in the recipe"
          />
        ) : (
          <span className="text-muted-foreground w-4 shrink-0 text-right text-xs tabular-nums">
            {index}.
          </span>
        )}
        <span className="truncate text-xs font-semibold tracking-wide">
          {label}
        </span>
        <span
          className={`shrink-0 text-[10px] tabular-nums ${
            done
              ? "font-medium text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground"
          }`}
        >
          {pickedCount}/{totalCount} picked
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          aria-label="Quantity to add"
          value={qtyText}
          onChange={(e) => setQtyText(e.target.value)}
          disabled={pickDisabled}
          className="h-8 w-14 text-xs tabular-nums"
        />
        <Select
          value={selectValue}
          onValueChange={(v) => {
            onSelectValue(v);
            onPick(v, pickQty);
            setQtyText("1");
          }}
          disabled={pickDisabled}
        >
          <SelectTrigger className="h-8 w-44 shrink-0 text-xs">
            <SelectValue
              placeholder={
                totalCount === 0
                  ? "None available"
                  : remaining === 0
                    ? "All added"
                    : "Pick a part…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__placeholder__" disabled>
              Pick a part…
            </SelectItem>
            {parts.map((p) => {
              const already = addedIds.has(p.id);
              return (
                <SelectItem
                  key={p.id}
                  value={p.id}
                  disabled={already}
                  className={
                    already
                      ? "bg-emerald-50/80 data-disabled:opacity-100 dark:bg-emerald-500/10"
                      : undefined
                  }
                >
                  {already ? (
                    <Check
                      className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden
                    />
                  ) : null}
                  <span className="font-mono text-xs">{p.sku}</span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {p.name}
                  </span>
                  {p.meta ? (
                    <span
                      className={`ml-2 text-[10px] tabular-nums ${
                        p.metaDanger
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {p.meta}
                    </span>
                  ) : null}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
