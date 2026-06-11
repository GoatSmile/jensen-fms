"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDkk } from "@/lib/parts/stock";
import { kitCode, stickerColor } from "@/lib/kits/colors";

import { cloneAsNewVersion } from "../_actions/clone-as-version";
import { saveTemplateParts } from "../_actions/save-parts";

export type CategoryOption = {
  id: string;
  name_en: string;
  name_da: string | null;
  sortOrder: number;
};

export type PartInCategory = {
  id: string;
  internal_sku: string;
  name_en: string;
  category_id: string | null;
  /** Customer (retail) price in DKK; null when unset or non-DKK. */
  retailDkk: number | null;
};

export type RecipeRow = {
  partId: string;
  partSku: string;
  partName: string;
  /** Where the part is classified today; null when the part lost its category. */
  categoryId: string | null;
  categoryName: string | null;
  quantity: string;
  isOptional: boolean;
  notes: string;
  /** Customer (retail) price in DKK; null when unset or non-DKK. */
  retailDkk: number | null;
};

export type KitOption = {
  id: string;
  sticker_color: string;
  kit_number: number | null;
};

type Props = {
  templateId: string;
  isCurrent: boolean;
  initialRows: RecipeRow[];
  categories: CategoryOption[];
  parts: PartInCategory[];
  /** Active kits, for the "add from kit" bulk action. */
  kits: KitOption[];
  /** kit_id → part_id[] (active kits only). */
  kitParts: Record<string, string[]>;
  /** The template's own sale price (DKK), for the margin sanity-check. */
  templateRetailDkk: number | null;
};

/**
 * Category-driven template parts editor.
 *
 * Layout:
 *   - LEFT column: one single-line row per category that has catalog parts —
 *     category name + its part picker side by side. Once at least one part
 *     from a category is in the recipe the row turns green with a check, and
 *     the counter reads picked/available — so the eye can scan down and see
 *     what's done. Categories without catalog parts collapse into an
 *     expander at the bottom.
 *   - RIGHT column: the running recipe grouped by category, each line with
 *     qty / optional / notes / remove + retail price, each group with a
 *     retail subtotal, and a parts-retail total compared against the
 *     template's own sale price at the bottom.
 *   - Footer: Save changes + Save as new version (data shape into
 *     saveTemplateParts is unchanged).
 *
 * Past versions render the same layout in read-only mode.
 */
export function PartsRecipeSection({
  templateId,
  isCurrent,
  initialRows,
  categories,
  parts,
  kits,
  kitParts,
  templateRetailDkk,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<RecipeRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showEmpty, setShowEmpty] = useState(false);
  // Per-category select state so we can reset to placeholder after add.
  const [pickerValueByCat, setPickerValueByCat] = useState<
    Record<string, string>
  >({});
  const [kitId, setKitId] = useState<string>("");
  const [kitNote, setKitNote] = useState<string | null>(null);

  const canEdit = isCurrent;

  // Group catalog parts by category for the LEFT panel.
  const partsByCategory = useMemo(() => {
    const m = new Map<string, PartInCategory[]>();
    for (const p of parts) {
      if (!p.category_id) continue;
      const arr = m.get(p.category_id);
      if (arr) arr.push(p);
      else m.set(p.category_id, [p]);
    }
    return m;
  }, [parts]);

  // Categories split into populated (have at least one catalog part) and
  // empty (none) — the latter goes behind an expander.
  const { populated, empty } = useMemo(() => {
    const p: CategoryOption[] = [];
    const e: CategoryOption[] = [];
    for (const c of categories) {
      const count = partsByCategory.get(c.id)?.length ?? 0;
      (count > 0 ? p : e).push(c);
    }
    return { populated: p, empty: e };
  }, [categories, partsByCategory]);

  // Quick lookup: which parts are already in the recipe.
  const inRecipePartIds = useMemo(
    () => new Set(rows.map((r) => r.partId)),
    [rows],
  );

  const partsById = useMemo(
    () => new Map(parts.map((p) => [p.id, p])),
    [parts],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  // For the selected kit: its parts that exist in the catalog, split into
  // addable vs already-in-recipe. Drives the button label and the result note.
  const kitAddable = useMemo(() => {
    if (!kitId) return { addable: [] as PartInCategory[], alreadyIn: 0 };
    const addable: PartInCategory[] = [];
    let alreadyIn = 0;
    for (const partId of kitParts[kitId] ?? []) {
      if (inRecipePartIds.has(partId)) {
        alreadyIn += 1;
        continue;
      }
      const part = partsById.get(partId);
      if (part) addable.push(part);
    }
    return { addable, alreadyIn };
  }, [kitId, kitParts, inRecipePartIds, partsById]);

  // How many recipe rows each category has — drives the done-state and the
  // picked/available counter on the left.
  const pickedByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (!r.categoryId) continue;
      m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  // Group the recipe by category for the RIGHT panel.
  const recipeByCategory = useMemo(() => {
    const m = new Map<string, RecipeRow[]>();
    for (const r of rows) {
      const key = r.categoryId ?? "__uncategorised__";
      const arr = m.get(key);
      if (arr) arr.push(r);
      else m.set(key, [r]);
    }
    return m;
  }, [rows]);

  // Has the user changed anything since the page loaded?
  const dirty = useMemo(() => {
    if (rows.length !== initialRows.length) return true;
    // initialRows is sorted by SKU; compare by partId set + per-row fields.
    const byId = new Map(initialRows.map((r) => [r.partId, r]));
    for (const r of rows) {
      const b = byId.get(r.partId);
      if (
        !b ||
        b.quantity !== r.quantity ||
        b.isOptional !== r.isOptional ||
        b.notes !== r.notes
      ) {
        return true;
      }
    }
    return false;
  }, [rows, initialRows]);

  const totalUnitsPerBike = useMemo(
    () =>
      rows.reduce((sum, r) => {
        const n = Number(r.quantity);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [rows],
  );

  // Running retail total of the recipe. Rows without a retail price are
  // counted so the gap is visible rather than silent.
  const retailTotal = useMemo(() => {
    let sum = 0;
    let unpriced = 0;
    for (const r of rows) {
      const qty = Number(r.quantity);
      if (r.retailDkk == null) unpriced += 1;
      else if (Number.isFinite(qty)) sum += qty * r.retailDkk;
    }
    return { sum, unpriced };
  }, [rows]);

  function onPickFromCategory(category: CategoryOption, partId: string) {
    if (!partId || partId === "__placeholder__") return;
    const part = partsByCategory.get(category.id)?.find((p) => p.id === partId);
    if (!part) return;
    setRows((prev) => [
      ...prev,
      {
        partId: part.id,
        partSku: part.internal_sku,
        partName: part.name_en,
        categoryId: category.id,
        categoryName: category.name_en,
        quantity: "1",
        isOptional: false,
        notes: "",
        retailDkk: part.retailDkk,
      },
    ]);
    // Reset the picker so it reads the placeholder again, ready for another.
    setPickerValueByCat((prev) => ({ ...prev, [category.id]: "__placeholder__" }));
    setSuccess(null);
  }

  // One-shot copy of a kit's parts into the (unsaved) recipe — the mirror
  // of the "label this BOM" action. No linkage: later kit edits don't touch
  // the template, and vice versa. Nothing hits the DB until Save changes.
  function onAddKit() {
    const kit = kits.find((k) => k.id === kitId);
    if (!kit || kitAddable.addable.length === 0) return;
    setRows((prev) => [
      ...prev,
      ...kitAddable.addable.map((part) => ({
        partId: part.id,
        partSku: part.internal_sku,
        partName: part.name_en,
        categoryId: part.category_id,
        categoryName: part.category_id
          ? (categoriesById.get(part.category_id)?.name_en ?? null)
          : null,
        quantity: "1",
        isOptional: false,
        notes: "",
        retailDkk: part.retailDkk,
      })),
    ]);
    const code = kitCode(kit.sticker_color, kit.kit_number);
    setKitNote(
      `Added ${kitAddable.addable.length} part${kitAddable.addable.length === 1 ? "" : "s"} from ${code}` +
        (kitAddable.alreadyIn > 0
          ? ` · ${kitAddable.alreadyIn} already in recipe`
          : ""),
    );
    setSuccess(null);
  }

  function updateRow(partId: string, patch: Partial<RecipeRow>) {
    setRows((prev) =>
      prev.map((r) => (r.partId === partId ? { ...r, ...patch } : r)),
    );
    setSuccess(null);
  }

  function removeRow(partId: string) {
    setRows((prev) => prev.filter((r) => r.partId !== partId));
    setSuccess(null);
  }

  function buildPartsPayload(): Array<{
    partId: string;
    quantity: number;
    isOptional: boolean;
    notes: string | null;
  }> {
    return rows.map((r) => ({
      partId: r.partId,
      quantity: Number(r.quantity),
      isOptional: r.isOptional,
      notes: r.notes.trim() === "" ? null : r.notes.trim(),
    }));
  }

  function onSave() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await saveTemplateParts({
        templateId,
        parts: buildPartsPayload(),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess("Recipe saved.");
      router.refresh();
    });
  }

  function onSaveAsVersion() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await cloneAsNewVersion(templateId, buildPartsPayload());
      if (!r || (r as { ok: boolean }).ok) return;
      const err = r as { ok: false; error: string };
      setError(err.error);
    });
  }

  return (
    <section className="rounded-md border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Parts recipe</h2>
          <p className="text-muted-foreground text-xs">
            {rows.length} part{rows.length === 1 ? "" : "s"} ·{" "}
            {totalUnitsPerBike} unit{totalUnitsPerBike === 1 ? "" : "s"} per
            bike
            {rows.length > 0 ? (
              <>
                {" · "}
                <span className="text-foreground font-medium tabular-nums">
                  parts retail {formatDkk(retailTotal.sum)}
                </span>
                {retailTotal.unpriced > 0
                  ? ` (${retailTotal.unpriced} unpriced)`
                  : null}
                {templateRetailDkk != null ? (
                  <>
                    {" · "}
                    <span className="tabular-nums">
                      sale price {formatDkk(templateRetailDkk)}
                    </span>
                    {" · "}
                    <span
                      className={`tabular-nums ${
                        templateRetailDkk - retailTotal.sum < 0
                          ? "text-destructive font-medium"
                          : ""
                      }`}
                    >
                      difference {formatDkk(templateRetailDkk - retailTotal.sum)}
                    </span>
                  </>
                ) : null}
              </>
            ) : null}
          </p>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={onSave}
              disabled={isPending || !dirty}
            >
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </header>

      <div className="p-4">
        {!canEdit ? (
          <p className="bg-muted text-muted-foreground mb-3 rounded-md border px-3 py-2 text-xs">
            This is a past version. Read-only — open the current version to
            edit.
          </p>
        ) : null}

        {error ? (
          <p className="text-destructive mb-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">
            {success}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* LEFT: Categories */}
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
              Parts by category
            </div>

            {canEdit && kits.length > 0 ? (
              <div className="bg-muted/20 mb-1 rounded-md border border-dashed px-2.5 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground shrink-0 text-xs">
                    Add a whole kit
                  </span>
                  <div className="flex items-center gap-2">
                    <Select
                      value={kitId}
                      onValueChange={(v) => {
                        setKitId(v);
                        setKitNote(null);
                      }}
                    >
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue placeholder="Pick a kit…" />
                      </SelectTrigger>
                      <SelectContent>
                        {kits.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            <span
                              aria-hidden
                              className="inline-block size-2.5 rounded-full border border-black/10"
                              style={{
                                backgroundColor: stickerColor(k.sticker_color)
                                  .hex,
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
                      onClick={onAddKit}
                      disabled={!kitId || kitAddable.addable.length === 0}
                    >
                      <Plus aria-hidden />
                      Add{" "}
                      {kitId
                        ? `${kitAddable.addable.length} part${kitAddable.addable.length === 1 ? "" : "s"}`
                        : "parts"}
                    </Button>
                  </div>
                </div>
                {kitNote ? (
                  <p
                    className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400"
                    role="status"
                  >
                    {kitNote}
                  </p>
                ) : kitId && kitAddable.addable.length === 0 ? (
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    Every part in this kit is already in the recipe.
                  </p>
                ) : null}
              </div>
            ) : null}

            {populated.map((category, index) => (
              <CategoryPickerRow
                key={category.id}
                index={index + 1}
                category={category}
                partsInCategory={partsByCategory.get(category.id) ?? []}
                inRecipePartIds={inRecipePartIds}
                pickedCount={pickedByCategory.get(category.id) ?? 0}
                selectValue={
                  pickerValueByCat[category.id] ?? "__placeholder__"
                }
                onSelectValue={(v) =>
                  setPickerValueByCat((prev) => ({ ...prev, [category.id]: v }))
                }
                onPick={(partId) => onPickFromCategory(category, partId)}
                disabled={!canEdit}
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
            <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
              Selected parts in this template
            </div>
            {rows.length === 0 ? (
              <div className="text-muted-foreground flex h-32 items-center justify-center rounded-md border border-dashed text-sm italic">
                Pick parts from the categories on the left.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {[...recipeByCategory.entries()]
                  .sort((a, b) => {
                    // Keep the right-panel grouping in the same order as the
                    // left panel (sort_order on the category).
                    const ai = categories.findIndex((c) => c.id === a[0]);
                    const bi = categories.findIndex((c) => c.id === b[0]);
                    return ai - bi;
                  })
                  .map(([catKey, catRows]) => {
                    const catName =
                      catRows[0]?.categoryName ?? "Uncategorised";
                    let subtotal = 0;
                    let hasPrice = false;
                    for (const r of catRows) {
                      const qty = Number(r.quantity);
                      if (r.retailDkk != null && Number.isFinite(qty)) {
                        subtotal += qty * r.retailDkk;
                        hasPrice = true;
                      }
                    }
                    return (
                      <div
                        key={catKey}
                        className="overflow-hidden rounded-md border shadow-xs"
                      >
                        <div className="bg-muted/40 flex items-center justify-between gap-2 border-b px-3 py-1.5">
                          <span className="text-xs font-medium uppercase tracking-wide">
                            {catName}
                          </span>
                          {hasPrice ? (
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {formatDkk(subtotal)}
                            </span>
                          ) : null}
                        </div>
                        <ul className="divide-y">
                          {catRows.map((r) => (
                            <RecipeLine
                              key={r.partId}
                              row={r}
                              canEdit={canEdit}
                              onChange={(patch) => updateRow(r.partId, patch)}
                              onRemove={() => removeRow(r.partId)}
                            />
                          ))}
                        </ul>
                      </div>
                    );
                  })}

                {/* Margin sanity-check: parts retail vs the template's own
                    sale price, live while composing. */}
                <div className="bg-muted/20 flex flex-col gap-1 rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      Parts retail total
                      {retailTotal.unpriced > 0 ? (
                        <span className="text-muted-foreground text-xs">
                          {" "}
                          ({retailTotal.unpriced} unpriced)
                        </span>
                      ) : null}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatDkk(retailTotal.sum)}
                    </span>
                  </div>
                  {templateRetailDkk != null ? (
                    <>
                      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                        <span>Template sale price</span>
                        <span className="tabular-nums">
                          {formatDkk(templateRetailDkk)}
                        </span>
                      </div>
                      <div
                        className={`flex items-center justify-between gap-2 text-xs ${
                          templateRetailDkk - retailTotal.sum < 0
                            ? "text-destructive font-medium"
                            : "text-muted-foreground"
                        }`}
                      >
                        <span>Difference (price − parts)</span>
                        <span className="tabular-nums">
                          {formatDkk(templateRetailDkk - retailTotal.sum)}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        {canEdit ? (
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onSaveAsVersion}
              disabled={isPending || rows.length === 0}
              title="Freeze this recipe as a new version. Past Manufacturing Orders keep referencing the old one."
            >
              <GitBranch aria-hidden /> Save as new version
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={isPending || !dirty}
            >
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CategoryPickerRow({
  index,
  category,
  partsInCategory,
  inRecipePartIds,
  pickedCount,
  selectValue,
  onSelectValue,
  onPick,
  disabled,
}: {
  index: number;
  category: CategoryOption;
  partsInCategory: PartInCategory[];
  inRecipePartIds: Set<string>;
  pickedCount: number;
  selectValue: string;
  onSelectValue: (v: string) => void;
  onPick: (partId: string) => void;
  disabled: boolean;
}) {
  // EN-only display; operating language is English.
  const label = category.name_en;
  const totalCount = partsInCategory.length;
  const remaining = partsInCategory.filter(
    (p) => !inRecipePartIds.has(p.id),
  ).length;
  const done = pickedCount > 0;

  // Single-line row: name (+ picked counter) left, picker right. Green tint
  // + check once something from this category is in the recipe, so the
  // template builder can scan down and see what's handled.
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
      <Select
        value={selectValue}
        onValueChange={(v) => {
          onSelectValue(v);
          onPick(v);
        }}
        disabled={disabled || remaining === 0}
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
          {partsInCategory.map((p) => {
            const already = inRecipePartIds.has(p.id);
            return (
              <SelectItem
                key={p.id}
                value={p.id}
                disabled={already}
                className={
                  // Same done-language as the category rows: a softer
                  // green wash on options that are already in the recipe.
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
                <span className="font-mono text-xs">{p.internal_sku}</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {p.name_en}
                </span>
                {p.retailDkk != null ? (
                  <span className="text-muted-foreground ml-2 text-[10px] tabular-nums">
                    {formatDkk(p.retailDkk)}
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

/**
 * Recipe quantities are almost always 1, so instead of a free-text field
 * the line shows the number with −/+ steppers. Floor is 1 (remove the
 * line via its trash button instead of stepping to 0). Legacy fractional
 * quantities still display; stepping from one rounds to whole units.
 */
function QtyStepper({
  value,
  partSku,
  onChange,
}: {
  value: string;
  partSku: string;
  onChange: (quantity: string) => void;
}) {
  const n = Number(value);
  const qty = Number.isFinite(n) && n > 0 ? n : 1;

  function step(delta: number) {
    const next = Math.max(1, Math.round(qty) + delta);
    onChange(String(next));
  }

  return (
    <div className="flex items-center rounded-md border">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-6 rounded-r-none"
        onClick={() => step(-1)}
        disabled={qty <= 1}
        aria-label={`Decrease quantity for ${partSku}`}
      >
        <Minus className="size-3" aria-hidden />
      </Button>
      <span
        className="min-w-7 px-1 text-center tabular-nums"
        aria-label={`Quantity for ${partSku}`}
      >
        {value}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-6 rounded-l-none"
        onClick={() => step(1)}
        aria-label={`Increase quantity for ${partSku}`}
      >
        <Plus className="size-3" aria-hidden />
      </Button>
    </div>
  );
}

function RecipeLine({
  row,
  canEdit,
  onChange,
  onRemove,
}: {
  row: RecipeRow;
  canEdit: boolean;
  onChange: (patch: Partial<RecipeRow>) => void;
  onRemove: () => void;
}) {
  const qty = Number(row.quantity);
  const lineTotal =
    row.retailDkk != null && Number.isFinite(qty) ? qty * row.retailDkk : null;

  return (
    <li className="flex flex-col gap-1.5 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex flex-col">
          <Link
            href={`/parts/${row.partId}`}
            className="text-sm font-medium break-words hover:underline"
          >
            {row.partName}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {lineTotal != null ? (
            <span className="text-sm font-medium tabular-nums">
              {formatDkk(lineTotal)}
            </span>
          ) : null}
          {canEdit ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onRemove}
              aria-label={`Remove ${row.partSku}`}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Qty</span>
          {canEdit ? (
            <QtyStepper
              value={row.quantity}
              partSku={row.partSku}
              onChange={(quantity) => onChange({ quantity })}
            />
          ) : (
            <span className="tabular-nums">{row.quantity}</span>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={row.isOptional}
            onChange={(e) => onChange({ isOptional: e.target.checked })}
            className="size-3.5"
            disabled={!canEdit}
          />
          <span className="text-muted-foreground">Optional</span>
        </label>
        {canEdit ? (
          <Input
            value={row.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Notes (optional)"
            className="h-7 flex-1 text-xs"
            aria-label={`Notes for ${row.partSku}`}
          />
        ) : row.notes ? (
          <span className="text-muted-foreground text-xs italic">
            {row.notes}
          </span>
        ) : null}
      </div>
    </li>
  );
}
