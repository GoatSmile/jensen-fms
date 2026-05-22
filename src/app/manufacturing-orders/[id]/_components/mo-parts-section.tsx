"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatQuantity } from "@/lib/parts/stock";

import {
  addMOPart,
  removeMOPart,
  updateMOPartQuantity,
} from "../_actions/manage-mo-parts";
import {
  SubstitutePartDialog,
  type PartChoice,
} from "./substitute-part-dialog";
import { Section } from "./section";

export type CategoryOption = {
  id: string;
  name_en: string;
  sortOrder: number;
};

export type PartInCatalog = {
  id: string;
  internal_sku: string;
  name_en: string;
  category_id: string | null;
  onHand: number;
};

export type MOPartRow = {
  id: string;
  partId: string;
  partSku: string;
  partName: string;
  /** Where the part is classified today; null when the part lost its category. */
  categoryId: string | null;
  categoryName: string | null;
  quantityPerBike: number;
  origin: "template" | "added" | "substituted" | "modified";
  substitutedFromPartName: string | null;
  notes: string | null;
  onHand: number;
};

type Props = {
  moId: string;
  rows: MOPartRow[];
  outstandingBikes: number;
  /** Used by SubstitutePartDialog (legacy add/sub picker). */
  partsCatalog: PartChoice[];
  /** New picker data: all active parts with stock + category links. */
  catalog: PartInCatalog[];
  /** All 57 active categories, sort_order-ordered. */
  categories: CategoryOption[];
  /** True when the MO is template-driven; false for one-off builds. */
  hasTemplate: boolean;
  /** Hide write actions when the MO is completed/cancelled. */
  readOnly: boolean;
};

type SubstituteState = {
  rowId: string;
  partName: string;
  qty: number;
};

/**
 * Category-driven MO parts recipe.
 *
 *   LEFT column: every category that has parts in the catalog, each with a
 *     picker dropdown. Picking a part adds it to the MO with origin='added'
 *     and qty=1; user edits qty inline on the right.
 *   RIGHT column: rows grouped by category, with origin badges, inline qty
 *     edit (template-origin rows flip to 'modified' on edit), shortfall vs.
 *     on-hand, substitute action, remove (non-template only).
 *
 * Substitute keeps the existing SubstitutePartDialog — it has the right
 * surface for picking a replacement part with a fresh qty.
 */
export function MOPartsSection({
  moId,
  rows,
  outstandingBikes,
  partsCatalog,
  catalog,
  categories,
  hasTemplate,
  readOnly,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [substitute, setSubstitute] = useState<SubstituteState | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [pickerValueByCat, setPickerValueByCat] = useState<
    Record<string, string>
  >({});

  // Group catalog parts by category for the picker.
  const partsByCategory = useMemo(() => {
    const m = new Map<string, PartInCatalog[]>();
    for (const p of catalog) {
      if (!p.category_id) continue;
      const arr = m.get(p.category_id);
      if (arr) arr.push(p);
      else m.set(p.category_id, [p]);
    }
    return m;
  }, [catalog]);

  // Categories split into populated / empty for the collapse-on-scroll layout.
  const { populated, empty } = useMemo(() => {
    const p: CategoryOption[] = [];
    const e: CategoryOption[] = [];
    for (const c of categories) {
      const count = partsByCategory.get(c.id)?.length ?? 0;
      (count > 0 ? p : e).push(c);
    }
    return { populated: p, empty: e };
  }, [categories, partsByCategory]);

  const onMoPartIds = useMemo(
    () => new Set(rows.map((r) => r.partId)),
    [rows],
  );

  // Right-panel grouping. The recipe order follows the category sort_order
  // so left and right stay visually aligned.
  const recipeByCategory = useMemo(() => {
    const m = new Map<string, MOPartRow[]>();
    for (const r of rows) {
      const key = r.categoryId ?? "__uncategorised__";
      const arr = m.get(key);
      if (arr) arr.push(r);
      else m.set(key, [r]);
    }
    return m;
  }, [rows]);

  return (
    <Section
      title="Parts recipe"
      description={
        hasTemplate
          ? "Qty per bike comes from the template (or your edits). On-hand is summed across all locations; shortfall is highlighted."
          : "One-off build — assemble the parts list from the categories on the left. Shortfall is highlighted."
      }
    >
      {error ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT: Categories */}
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
            Parts by category
          </div>
          {populated.map((category, index) => (
            <CategoryPickerRow
              key={category.id}
              index={index + 1}
              category={category}
              partsInCategory={partsByCategory.get(category.id) ?? []}
              inMoPartIds={onMoPartIds}
              selectValue={pickerValueByCat[category.id] ?? "__placeholder__"}
              onSelectValue={(v) =>
                setPickerValueByCat((prev) => ({ ...prev, [category.id]: v }))
              }
              moId={moId}
              disabled={readOnly}
              onError={setError}
              onAdded={(partId) =>
                setPickerValueByCat((prev) => ({
                  ...prev,
                  [category.id]: "__placeholder__",
                }))
              }
            />
          ))}

          {empty.length > 0 ? (
            <div className="mt-2 rounded-md border border-dashed">
              <button
                type="button"
                onClick={() => setShowEmpty((v) => !v)}
                className="hover:bg-muted/30 flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
              >
                {showEmpty ? (
                  <ChevronDown className="size-3.5" aria-hidden />
                ) : (
                  <ChevronRight className="size-3.5" aria-hidden />
                )}
                <span className="text-muted-foreground">
                  {empty.length} empty categor
                  {empty.length === 1 ? "y" : "ies"} (no parts in catalog yet)
                </span>
              </button>
              {showEmpty ? (
                <ul className="text-muted-foreground border-t px-3 py-2 text-xs">
                  {empty.map((c, i) => (
                    <li key={c.id} className="py-0.5">
                      {populated.length + i + 1}. {c.name_en}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* RIGHT: Recipe */}
        <div className="flex flex-col gap-2">
          <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wide">
            <span>Selected parts</span>
            <span className="text-muted-foreground text-[10px] normal-case tracking-normal">
              × {outstandingBikes} outstanding
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="text-muted-foreground flex h-32 items-center justify-center rounded-md border border-dashed text-sm italic">
              No parts on this MO yet. Pick from the categories on the left.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {[...recipeByCategory.entries()]
                .sort((a, b) => {
                  const ai = categories.findIndex((c) => c.id === a[0]);
                  const bi = categories.findIndex((c) => c.id === b[0]);
                  return ai - bi;
                })
                .map(([catKey, catRows]) => {
                  const catName =
                    catRows[0]?.categoryName ?? "Uncategorised";
                  return (
                    <div key={catKey} className="rounded-md border">
                      <div className="bg-muted/30 border-b px-3 py-1.5 text-xs font-medium uppercase tracking-wide">
                        {catName}
                      </div>
                      <ul className="divide-y">
                        {catRows.map((r) => (
                          <RecipeLine
                            key={r.id}
                            moId={moId}
                            row={r}
                            outstandingBikes={outstandingBikes}
                            readOnly={readOnly}
                            onSubstitute={() =>
                              setSubstitute({
                                rowId: r.id,
                                partName: r.partName,
                                qty: r.quantityPerBike,
                              })
                            }
                            onError={setError}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {substitute !== null ? (
        <SubstitutePartDialog
          key={`sub-${substitute.rowId}`}
          open
          onOpenChange={(open) => {
            if (!open) setSubstitute(null);
          }}
          moId={moId}
          mode={{
            kind: "substitute",
            originalRowId: substitute.rowId,
            originalPartName: substitute.partName,
            originalQty: substitute.qty,
          }}
          parts={partsCatalog}
          excludeIds={onMoPartIds}
        />
      ) : null}
    </Section>
  );
}

function CategoryPickerRow({
  index,
  category,
  partsInCategory,
  inMoPartIds,
  selectValue,
  onSelectValue,
  moId,
  disabled,
  onError,
  onAdded,
}: {
  index: number;
  category: CategoryOption;
  partsInCategory: PartInCatalog[];
  inMoPartIds: Set<string>;
  selectValue: string;
  onSelectValue: (v: string) => void;
  moId: string;
  disabled: boolean;
  onError: (msg: string | null) => void;
  onAdded: (partId: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const totalCount = partsInCategory.length;
  const remaining = partsInCategory.filter((p) => !inMoPartIds.has(p.id))
    .length;

  function onPick(partId: string) {
    if (!partId || partId === "__placeholder__") return;
    onSelectValue(partId);
    onError(null);
    start(async () => {
      const r = await addMOPart(moId, partId, 1);
      if (!r.ok) {
        onError(r.error);
        return;
      }
      onAdded(partId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {index}.
        </span>
        <span className="text-xs font-semibold tracking-wide">
          {category.name_en}
        </span>
        <span className="text-muted-foreground text-[10px]">
          ({remaining}/{totalCount})
        </span>
      </div>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          onPick(v);
        }}
        disabled={disabled || remaining === 0 || pending}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue
            placeholder={
              totalCount === 0
                ? "-- None available --"
                : remaining === 0
                  ? "-- All added --"
                  : `-- Pick (${remaining}) --`
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__placeholder__" disabled>
            -- Pick a part --
          </SelectItem>
          {partsInCategory.map((p) => {
            const already = inMoPartIds.has(p.id);
            return (
              <SelectItem key={p.id} value={p.id} disabled={already}>
                <span className="font-mono text-xs">{p.internal_sku}</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {p.name_en}
                </span>
                <span
                  className={`ml-2 text-[10px] ${
                    p.onHand <= 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  ({formatQuantity(p.onHand)} on hand)
                </span>
                {already ? (
                  <span className="text-muted-foreground ml-2 text-[10px] italic">
                    already added
                  </span>
                ) : null}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

function RecipeLine({
  moId,
  row,
  outstandingBikes,
  readOnly,
  onSubstitute,
  onError,
}: {
  moId: string;
  row: MOPartRow;
  outstandingBikes: number;
  readOnly: boolean;
  onSubstitute: () => void;
  onError: (msg: string | null) => void;
}) {
  const totalNeeded = row.quantityPerBike * outstandingBikes;
  const shortfall = Math.max(0, totalNeeded - row.onHand);
  const removable = row.origin !== "template";

  return (
    <li className="flex flex-col gap-1.5 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/parts/${row.partId}`}
            className="text-sm font-medium break-words hover:underline"
          >
            {row.partName}
          </Link>
          <span className="text-muted-foreground font-mono text-[10px] break-all">
            {row.partSku}
          </span>
          {row.substitutedFromPartName ? (
            <span className="text-muted-foreground mt-0.5 text-[10px] italic">
              replaces {row.substitutedFromPartName}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <OriginBadge origin={row.origin} />
          {!readOnly ? (
            <RowActions
              moId={moId}
              row={row}
              onSubstitute={onSubstitute}
              onError={onError}
            />
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <QuantityField
          moId={moId}
          row={row}
          readOnly={readOnly}
          onError={onError}
        />
        <span className="text-muted-foreground">
          Total need:{" "}
          <span className="tabular-nums">{formatQuantity(totalNeeded)}</span>
        </span>
        <span className="text-muted-foreground">
          On hand:{" "}
          <span className="tabular-nums">{formatQuantity(row.onHand)}</span>
        </span>
        <span
          className={`tabular-nums ${
            shortfall > 0
              ? "text-destructive font-medium"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {shortfall > 0 ? `Shortfall ${formatQuantity(shortfall)}` : "Stocked"}
        </span>
      </div>
    </li>
  );
}

/**
 * Inline qty editor. Optimistic UI: shows the typed value immediately, syncs
 * to the server on blur (or Enter). Template-origin rows are editable too —
 * the server action flips origin to 'modified' on save.
 */
function QuantityField({
  moId,
  row,
  readOnly,
  onError,
}: {
  moId: string;
  row: MOPartRow;
  readOnly: boolean;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(row.quantityPerBike));
  const [pending, start] = useTransition();

  function commit() {
    const next = Number(value.replace(",", "."));
    if (!Number.isFinite(next) || next <= 0) {
      setValue(String(row.quantityPerBike));
      onError("Quantity must be a positive number.");
      return;
    }
    if (next === row.quantityPerBike) return;
    onError(null);
    start(async () => {
      const r = await updateMOPartQuantity(moId, row.id, next);
      if (!r.ok) {
        onError(r.error);
        setValue(String(row.quantityPerBike));
        return;
      }
      router.refresh();
    });
  }

  if (readOnly) {
    return (
      <span className="text-muted-foreground">
        Qty/bike:{" "}
        <span className="text-foreground tabular-nums">
          {formatQuantity(row.quantityPerBike)}
        </span>
      </span>
    );
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="text-muted-foreground">Qty/bike</span>
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        disabled={pending}
        className="h-7 w-[64px] text-right text-xs"
        aria-label={`Quantity per bike for ${row.partSku}`}
      />
    </label>
  );
}

function OriginBadge({ origin }: { origin: MOPartRow["origin"] }) {
  if (origin === "template") {
    return (
      <Badge variant="outline" className="font-normal text-[10px]">
        template
      </Badge>
    );
  }
  if (origin === "added") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        added
      </Badge>
    );
  }
  if (origin === "substituted") {
    return (
      <Badge variant="warning" className="text-[10px]">
        substituted
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      {origin}
    </Badge>
  );
}

function RowActions({
  moId,
  row,
  onSubstitute,
  onError,
}: {
  moId: string;
  row: MOPartRow;
  onSubstitute: () => void;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);

  function runRemove() {
    onError(null);
    start(async () => {
      const r = await removeMOPart(moId, row.id);
      if (!r.ok) {
        onError(r.error);
        setConfirmRemove(false);
        return;
      }
      router.refresh();
    });
  }

  const removable = row.origin !== "template";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Actions for ${row.partSku}`}
          disabled={pending}
        >
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onSubstitute();
          }}
        >
          <ArrowRightLeft aria-hidden /> Substitute
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!removable || pending}
          title={
            !removable
              ? "Template-origin parts can't be removed; substitute instead."
              : undefined
          }
          onSelect={(e) => {
            e.preventDefault();
            if (!removable) return;
            if (confirmRemove) runRemove();
            else setConfirmRemove(true);
          }}
        >
          <Trash2 aria-hidden />{" "}
          {confirmRemove ? "Click again to confirm" : "Remove"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
