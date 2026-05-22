"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
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
};

type Props = {
  templateId: string;
  isCurrent: boolean;
  initialRows: RecipeRow[];
  categories: CategoryOption[];
  parts: PartInCategory[];
};

/**
 * Category-driven template parts editor.
 *
 * Layout (per Dennis's FleetManager Pro mock + adjustments we agreed on):
 *   - LEFT column: one row per category that has parts in the catalog. Each
 *     row shows the category name and a picker of its parts. Categories
 *     without any catalog parts collapse into a single "+ N empty" expander
 *     at the bottom so they're available but don't bury the populated ones.
 *   - RIGHT column: the running recipe — every part the user has added,
 *     grouped by category, with editable quantity / optional / notes /
 *     remove. The DB enforces UNIQUE(template, part) so the same part can
 *     only appear once; the picker disables already-added parts.
 *   - Footer: Save changes + Save as new version (existing actions; the data
 *     shape going into saveTemplateParts is unchanged).
 *
 * Past versions render the same layout in read-only mode.
 */
export function PartsRecipeSection({
  templateId,
  isCurrent,
  initialRows,
  categories,
  parts,
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
      },
    ]);
    // Reset the picker so it reads "-- Vælg --" again, ready for another.
    setPickerValueByCat((prev) => ({ ...prev, [category.id]: "__placeholder__" }));
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
            {totalUnitsPerBike} unit{totalUnitsPerBike === 1 ? "" : "s"} per bike
          </p>
        </div>
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
                inRecipePartIds={inRecipePartIds}
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
              <div className="flex flex-col gap-2">
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
                    return (
                      <div
                        key={catKey}
                        className="rounded-md border"
                      >
                        <div className="bg-muted/30 border-b px-3 py-1.5 text-xs font-medium uppercase tracking-wide">
                          {catName}
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
  selectValue,
  onSelectValue,
  onPick,
  disabled,
}: {
  index: number;
  category: CategoryOption;
  partsInCategory: PartInCategory[];
  inRecipePartIds: Set<string>;
  selectValue: string;
  onSelectValue: (v: string) => void;
  onPick: (partId: string) => void;
  disabled: boolean;
}) {
  // EN-only display; operating language is English. Title case matches the
  // rest of the app rather than the all-caps in Dennis's mock.
  const label = category.name_en;
  const totalCount = partsInCategory.length;
  const remaining = partsInCategory.filter(
    (p) => !inRecipePartIds.has(p.id),
  ).length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {index}.
        </span>
        <span className="text-xs font-semibold tracking-wide">{label}</span>
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
            const already = inRecipePartIds.has(p.id);
            return (
              <SelectItem key={p.id} value={p.id} disabled={already}>
                <span className="font-mono text-xs">{p.internal_sku}</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {p.name_en}
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
          <span className="text-muted-foreground font-mono text-[10px] break-all">
            {row.partSku}
          </span>
        </div>
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
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Qty</span>
          {canEdit ? (
            <Input
              inputMode="decimal"
              value={row.quantity}
              onChange={(e) => onChange({ quantity: e.target.value })}
              className="h-7 w-[60px] text-right text-xs"
              aria-label={`Quantity for ${row.partSku}`}
            />
          ) : (
            <span className="tabular-nums">{row.quantity}</span>
          )}
        </label>
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
