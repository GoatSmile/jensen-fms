"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Lock,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColorChip } from "@/components/color-swatch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDkk, formatQuantity } from "@/lib/parts/stock";
import {
  BIKE_STATUS_VARIANT,
  bikeStatusLabel,
  type BikeStatus,
} from "@/lib/bikes/status";

import {
  addBikePart,
  copyMoRecipeToBike,
  removeBikePart,
  updateBikePartQuantity,
} from "../_actions/manage-bike-parts";
import { finishBikeBuild } from "../_actions/finish-build";

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
  /** Customer (retail) price in DKK; null when unset or non-DKK. */
  retailDkk: number | null;
};

export type BikePartRow = {
  id: string;
  partId: string;
  partSku: string;
  partName: string;
  categoryId: string | null;
  categoryName: string | null;
  quantity: number;
  consumed: boolean;
  notes: string | null;
  onHand: number;
  /** Customer (retail) price in DKK; null when unset or non-DKK. */
  retailDkk: number | null;
};

type Props = {
  moId: string;
  moNumber: string;
  bikeId: string;
  bikeFrameNumber: string;
  bikeStatus: BikeStatus;
  bikeBuildCostDkk: number | null;
  templateLabel: string | null;
  colorName: string | null;
  colorHex: string | null;
  initialBikeParts: BikePartRow[];
  categories: CategoryOption[];
  catalog: PartInCatalog[];
  /** How many parts are in the MO recipe — used for the "Copy recipe" CTA. */
  moRecipeRowCount: number;
  /** True when status is in_stock+ / MO closed — read-only display. */
  readOnly: boolean;
  /** Server-rendered "pick list by kit" card, shown above the workbench. */
  pickListSlot?: React.ReactNode;
};

export function BuildWorkbench({
  moId,
  moNumber,
  bikeId,
  bikeFrameNumber,
  bikeStatus,
  bikeBuildCostDkk,
  templateLabel,
  colorName,
  colorHex,
  initialBikeParts,
  categories,
  catalog,
  moRecipeRowCount,
  readOnly,
  pickListSlot,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [pickerValueByCat, setPickerValueByCat] = useState<
    Record<string, string>
  >({});
  const [isFinishing, startFinish] = useTransition();
  const [isSeeding, startSeed] = useTransition();

  const rows = initialBikeParts;
  const isEmpty = rows.length === 0;

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

  const { populated, empty } = useMemo(() => {
    const p: CategoryOption[] = [];
    const e: CategoryOption[] = [];
    for (const c of categories) {
      const count = partsByCategory.get(c.id)?.length ?? 0;
      (count > 0 ? p : e).push(c);
    }
    return { populated: p, empty: e };
  }, [categories, partsByCategory]);

  const inBikePartIds = useMemo(
    () => new Set(rows.map((r) => r.partId)),
    [rows],
  );

  const recipeByCategory = useMemo(() => {
    const m = new Map<string, BikePartRow[]>();
    for (const r of rows) {
      const key = r.categoryId ?? "__uncategorised__";
      const arr = m.get(key);
      if (arr) arr.push(r);
      else m.set(key, [r]);
    }
    return m;
  }, [rows]);

  // Running retail total of the bike — what the customer-facing price of
  // the assembled parts adds up to. Rows without a retail price are
  // excluded and counted so the gap is visible rather than silent.
  const retailTotal = useMemo(() => {
    let sum = 0;
    let unpriced = 0;
    for (const r of rows) {
      if (r.retailDkk == null) unpriced += 1;
      else sum += r.quantity * r.retailDkk;
    }
    return { sum, unpriced };
  }, [rows]);

  function onCopyRecipe() {
    setError(null);
    setSuccess(null);
    startSeed(async () => {
      const r = await copyMoRecipeToBike(moId, bikeId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess("Recipe copied. Edit any rows that need to differ for this bike.");
      router.refresh();
    });
  }

  function onPickFromCategory(categoryId: string, partId: string) {
    if (!partId || partId === "__placeholder__") return;
    setError(null);
    setSuccess(null);
    startSeed(async () => {
      const r = await addBikePart(moId, bikeId, partId, 1);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPickerValueByCat((prev) => ({ ...prev, [categoryId]: "__placeholder__" }));
      router.refresh();
    });
  }

  function onFinish() {
    setError(null);
    setSuccess(null);
    startFinish(async () => {
      const r = await finishBikeBuild(moId, bikeId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(
        `Build finished — ${r.partsConsumed} part${r.partsConsumed === 1 ? "" : "s"} consumed${r.buildCostDkk > 0 ? `, cost ${formatDkk(r.buildCostDkk)}` : ""}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header card with bike identity + status + actions */}
      <section className="rounded-md border">
        <div className="border-b px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  MO <Link href={`/manufacturing-orders/${moId}`} className="font-mono hover:underline">{moNumber}</Link>
                </span>
                <Badge variant={BIKE_STATUS_VARIANT[bikeStatus] ?? "outline"}>
                  {bikeStatusLabel(bikeStatus)}
                </Badge>
                {colorName ? (
                  <ColorChip hex={colorHex} label={colorName} />
                ) : (
                  <Badge variant="outline" className="font-normal italic">
                    unpainted
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                <Link
                  href={`/bikes/${bikeId}`}
                  className="font-mono hover:underline"
                >
                  {bikeFrameNumber}
                </Link>
              </h1>
              {templateLabel ? (
                <p className="text-muted-foreground text-sm">{templateLabel}</p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              {bikeBuildCostDkk != null ? (
                <div className="text-right">
                  <div className="text-muted-foreground text-xs uppercase">
                    Build cost
                  </div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {formatDkk(bikeBuildCostDkk)}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs italic">
                  Build cost stamps when you finish the build.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {pickListSlot}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {success}
        </p>
      ) : null}

      {/* Workbench: categories left, this bike's parts right */}
      <section className="rounded-md border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">Parts on this bike</h2>
            <p className="text-muted-foreground text-xs">
              The MO recipe is the default; pick anything that differs for{" "}
              <span className="font-mono">{bikeFrameNumber}</span>. Inventory is
              consumed when you click <strong>Finish build</strong>.
            </p>
          </div>
          {!readOnly && isEmpty && moRecipeRowCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCopyRecipe}
              disabled={isSeeding}
            >
              <Copy aria-hidden /> Copy MO recipe ({moRecipeRowCount} parts)
            </Button>
          ) : null}
        </div>

        <div className="p-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* LEFT: Category picker (hidden in read-only mode) */}
            {readOnly ? (
              <div className="text-muted-foreground hidden flex-col items-center justify-center rounded-md border border-dashed p-6 text-sm italic lg:flex">
                <Lock className="size-5" aria-hidden />
                Build is finalised — picker locked.
              </div>
            ) : (
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
                    inBikePartIds={inBikePartIds}
                    selectValue={
                      pickerValueByCat[category.id] ?? "__placeholder__"
                    }
                    onSelectValue={(v) =>
                      setPickerValueByCat((prev) => ({ ...prev, [category.id]: v }))
                    }
                    onPick={(partId) => onPickFromCategory(category.id, partId)}
                    disabled={readOnly || isSeeding || isFinishing}
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
                        {empty.length === 1 ? "y" : "ies"}
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
            )}

            {/* RIGHT: this bike's parts */}
            <div className={`flex flex-col gap-2 ${readOnly ? "lg:col-span-2" : ""}`}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Selected parts ({rows.length})
                </span>
                {rows.length > 0 ? (
                  <span className="text-xs tabular-nums">
                    Retail total:{" "}
                    <span className="font-semibold">
                      {formatDkk(retailTotal.sum)}
                    </span>
                    {retailTotal.unpriced > 0 ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({retailTotal.unpriced} unpriced)
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
              {isEmpty ? (
                <div className="text-muted-foreground flex h-32 items-center justify-center rounded-md border border-dashed text-sm italic">
                  {readOnly
                    ? "No parts on this bike."
                    : moRecipeRowCount > 0
                      ? "Empty. Copy the MO recipe (above) or pick parts from the categories on the left."
                      : "Pick parts from the categories on the left."}
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
                                bikeId={bikeId}
                                row={r}
                                readOnly={readOnly}
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
        </div>

        {!readOnly ? (
          <footer className="border-t bg-muted/20 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-muted-foreground text-xs">
              {rows.length === 0
                ? "Add parts before finishing."
                : `${rows.length} part${rows.length === 1 ? "" : "s"} ready to consume.`}
            </p>
            <Button
              type="button"
              size="lg"
              onClick={onFinish}
              disabled={isFinishing || isSeeding || rows.length === 0}
            >
              <CheckCircle2 aria-hidden />{" "}
              {isFinishing ? "Finishing…" : "Finish build"}
            </Button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}

function CategoryPickerRow({
  index,
  category,
  partsInCategory,
  inBikePartIds,
  selectValue,
  onSelectValue,
  onPick,
  disabled,
}: {
  index: number;
  category: CategoryOption;
  partsInCategory: PartInCatalog[];
  inBikePartIds: Set<string>;
  selectValue: string;
  onSelectValue: (v: string) => void;
  onPick: (partId: string) => void;
  disabled: boolean;
}) {
  const totalCount = partsInCategory.length;
  const remaining = partsInCategory.filter((p) => !inBikePartIds.has(p.id))
    .length;

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
          onSelectValue(v);
          onPick(v);
        }}
        disabled={disabled || remaining === 0}
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
            const already = inBikePartIds.has(p.id);
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
  bikeId,
  row,
  readOnly,
  onError,
}: {
  moId: string;
  bikeId: string;
  row: BikePartRow;
  readOnly: boolean;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState(String(row.quantity));

  // Rows with an inventory_movement_id are frozen even outside read-only mode
  // because the consumption is recorded against that movement.
  const frozen = readOnly || row.consumed;

  function commitQty() {
    const next = Number(qty.replace(",", "."));
    if (!Number.isFinite(next) || next <= 0) {
      setQty(String(row.quantity));
      onError("Quantity must be a positive number.");
      return;
    }
    if (next === row.quantity) return;
    onError(null);
    start(async () => {
      const r = await updateBikePartQuantity(moId, bikeId, row.id, next);
      if (!r.ok) {
        onError(r.error);
        setQty(String(row.quantity));
        return;
      }
      router.refresh();
    });
  }

  function runRemove() {
    onError(null);
    start(async () => {
      const r = await removeBikePart(moId, bikeId, row.id);
      if (!r.ok) {
        onError(r.error);
        return;
      }
      router.refresh();
    });
  }

  const shortfall = row.quantity - row.onHand;

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
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {row.consumed ? (
            <Badge variant="success" className="text-[10px]">
              consumed
            </Badge>
          ) : null}
          {!frozen ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={runRemove}
              disabled={pending}
              aria-label={`Remove ${row.partSku}`}
              title="Remove from this bike"
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Qty</span>
          {!frozen ? (
            <Input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={commitQty}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              disabled={pending}
              className="h-7 w-[60px] text-right text-xs"
              aria-label={`Quantity for ${row.partSku}`}
            />
          ) : (
            <span className="tabular-nums">{formatQuantity(row.quantity)}</span>
          )}
        </label>
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
          {shortfall > 0 ? `Short by ${formatQuantity(shortfall)}` : "Stocked"}
        </span>
        <span className="text-muted-foreground ml-auto tabular-nums">
          {row.retailDkk != null
            ? `${formatDkk(row.quantity * row.retailDkk)}`
            : "no retail price"}
        </span>
      </div>
    </li>
  );
}
