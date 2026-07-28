"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("recipe");
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
      // Two fills, no border: 58 bordered rows in a column is the wall of boxes
      // the panel replaced (plan §9). `bg-ground` recesses an outstanding
      // category inside the panel's surface, `good` marks a handled one — the
      // Check glyph and the picked/total count carry the same state in text, so
      // colour is not the only signal.
      className={`flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 transition-colors ${
        done ? "bg-good-wash" : "bg-ground"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {done ? (
          <Check
            className="size-4 shrink-0 text-good"
            aria-label={t("doneAria")}
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
              ? "font-medium text-good"
              : "text-muted-foreground"
          }`}
        >
          {t("picked", { picked: pickedCount, total: totalCount })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          aria-label={t("qtyAria")}
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
                  ? t("noneAvailable")
                  : remaining === 0
                    ? t("allAdded")
                    : t("pickPart")
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__placeholder__" disabled>
              {t("pickPart")}
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
                      ? "bg-good-wash data-disabled:opacity-100"
                      : undefined
                  }
                >
                  {already ? (
                    <Check
                      className="size-3.5 shrink-0 text-good"
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
