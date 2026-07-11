"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { kitCode, stickerColor } from "@/lib/kits/colors";

export type KitOption = {
  id: string;
  sticker_color: string;
  kit_number: number | null;
};

export type KitAddOutcome =
  | { error: string }
  | { added: number; alreadyIn: number };

type Props = {
  kits: KitOption[];
  /** kit_id → part_id[] (active kits only). */
  kitParts: Record<string, string[]>;
  /** Part ids already in the recipe — counted as "already in". */
  addedIds: Set<string>;
  /** Catalog part ids — kit members outside the catalog are ignored. */
  knownPartIds: Set<string>;
  /**
   * Perform the add. Receives the kit and the addable part ids (already
   * filtered against addedIds/knownPartIds). Local editors append rows and
   * return the counts; server-backed editors call their action and map its
   * result.
   */
  onAdd: (kitId: string, addablePartIds: string[]) => Promise<KitAddOutcome>;
  disabled?: boolean;
};

/**
 * "Add a whole kit" box for recipe editors — pick a sticker code, one
 * button adds every kit part that isn't already in the recipe. Shared by
 * the bike-template editor and the MO parts editor.
 */
export function KitBulkAdd({
  kits,
  kitParts,
  addedIds,
  knownPartIds,
  onAdd,
  disabled,
}: Props) {
  const t = useTranslations("recipe");
  const [kitId, setKitId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const { addable, alreadyIn } = useMemo(() => {
    if (!kitId) return { addable: [] as string[], alreadyIn: 0 };
    const addable: string[] = [];
    let alreadyIn = 0;
    for (const partId of kitParts[kitId] ?? []) {
      if (!knownPartIds.has(partId)) continue;
      if (addedIds.has(partId)) alreadyIn += 1;
      else addable.push(partId);
    }
    return { addable, alreadyIn };
  }, [kitId, kitParts, addedIds, knownPartIds]);

  if (kits.length === 0) return null;

  function runAdd() {
    const kit = kits.find((k) => k.id === kitId);
    if (!kit || addable.length === 0) return;
    setNote(null);
    setError(null);
    start(async () => {
      const outcome = await onAdd(kit.id, addable);
      if ("error" in outcome) {
        setError(outcome.error);
        return;
      }
      const code = kitCode(kit.sticker_color, kit.kit_number);
      setNote(
        t("addedNote", { count: outcome.added, code }) +
          (outcome.alreadyIn > 0
            ? t("alreadyInSuffix", { count: outcome.alreadyIn })
            : ""),
      );
    });
  }

  return (
    <div className="bg-muted/20 mb-1 rounded-md border border-dashed px-2.5 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground shrink-0 text-xs">
          {t("addWholeKit")}
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={kitId}
            onValueChange={(v) => {
              setKitId(v);
              setNote(null);
              setError(null);
            }}
            disabled={disabled || isPending}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder={t("pickKit")} />
            </SelectTrigger>
            <SelectContent>
              {kits.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full border border-black/10"
                    style={{
                      backgroundColor: stickerColor(k.sticker_color).hex,
                    }}
                  />
                  {kitCode(k.sticker_color, k.kit_number)}
                  <span className="text-muted-foreground ml-1 text-[10px] tabular-nums">
                    {(kitParts[k.id] ?? []).length}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runAdd}
            disabled={disabled || isPending || !kitId || addable.length === 0}
          >
            <Plus aria-hidden />
            {isPending
              ? t("adding")
              : kitId
                ? t("addCount", { count: addable.length })
                : t("addParts")}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="text-destructive mt-1.5 text-xs" role="alert">
          {error}
        </p>
      ) : note ? (
        <p
          className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          {note}
        </p>
      ) : kitId && addable.length === 0 ? (
        <p className="text-muted-foreground mt-1.5 text-xs">
          {t("allInRecipe")}
        </p>
      ) : null}
    </div>
  );
}
