"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { kitCode, stickerColor } from "@/lib/kits/colors";

import { addKitToPart, removeKitFromPart } from "../_actions/manage-part-kits";
import { Section } from "./section";

export type PartKitChip = {
  kitId: string;
  sticker_color: string;
  kit_number: number;
  is_active: boolean;
};

export type KitOption = {
  id: string;
  sticker_color: string;
  kit_number: number;
};

const PLACEHOLDER = "__placeholder__";

/**
 * Kit labels on a part — the colour+number box stickers ("Red 1") the
 * assembly floor picks by. Add via the select; remove via the chip ×.
 * Archived kits' labels stay visible (greyed) until removed by hand.
 */
export function KitsSection({
  partId,
  chips,
  options,
}: {
  partId: string;
  chips: PartKitChip[];
  options: KitOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [selectValue, setSelectValue] = useState(PLACEHOLDER);

  const taggedIds = new Set(chips.map((c) => c.kitId));
  const addable = options.filter((o) => !taggedIds.has(o.id));

  function onAdd(kitId: string) {
    if (!kitId || kitId === PLACEHOLDER) return;
    setError(null);
    start(async () => {
      const r = await addKitToPart(partId, kitId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSelectValue(PLACEHOLDER);
      router.refresh();
    });
  }

  function onRemove(kitId: string) {
    setError(null);
    start(async () => {
      const r = await removeKitFromPart(partId, kitId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Section
      title="Kit labels"
      description="Box stickers the assembly floor picks by — a part can carry several, or none."
      action={
        addable.length > 0 ? (
          <Select
            value={selectValue}
            onValueChange={(v) => {
              setSelectValue(v);
              onAdd(v);
            }}
            disabled={pending}
          >
            <SelectTrigger className="h-8 w-44 text-xs" aria-label="Add kit label">
              <SelectValue placeholder="Add label…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PLACEHOLDER} className="hidden">
                Add label…
              </SelectItem>
              {addable.map((o) => {
                const colour = stickerColor(o.sticker_color);
                return (
                  <SelectItem key={o.id} value={o.id}>
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-3 rounded-full border border-black/10"
                        style={{ backgroundColor: colour.hex }}
                      />
                      {kitCode(o.sticker_color, o.kit_number)}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : undefined
      }
    >
      {chips.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No kit labels on this part.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const colour = stickerColor(c.sticker_color);
            return (
              <span
                key={c.kitId}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  c.is_active ? "" : "opacity-50"
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full border border-black/10"
                  style={{ backgroundColor: colour.hex }}
                />
                {kitCode(c.sticker_color, c.kit_number)}
                {!c.is_active ? (
                  <span className="text-muted-foreground">(archived)</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRemove(c.kitId)}
                  disabled={pending}
                  aria-label={`Remove ${kitCode(c.sticker_color, c.kit_number)}`}
                  className="text-muted-foreground hover:text-destructive -mr-0.5"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {error ? (
        <p className="text-destructive mt-2 text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </Section>
  );
}
