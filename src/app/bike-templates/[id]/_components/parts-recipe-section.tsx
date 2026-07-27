"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";

import { localizedName } from "@/i18n/vocab";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { CategoryChecklistRow } from "@/components/recipe/category-checklist-row";
import {
  KitBulkAdd,
  type KitAddOutcome,
  type KitOption,
} from "@/components/recipe/kit-bulk-add";
import { formatDkk } from "@/lib/parts/stock";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

import { cloneAsNewVersion } from "../_actions/clone-as-version";
import { saveTemplateParts } from "../_actions/save-parts";

export type { KitOption };

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
  /** Last landed purchase cost in DKK/unit; null when no purchase history. */
  costDkk: number | null;
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
  /** Last landed purchase cost in DKK/unit; null when no purchase history. */
  costDkk: number | null;
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
  /** Paint-per-bike estimate from the paintwork declaration; null when no
   * paintwork is declared. totalDkk null = declared but unpriceable (no
   * list / FX gap) — the cost box then falls back to parts only. */
  paintEstimate: {
    totalDkk: number | null;
    totalLabel: string | null;
    listLabel: string | null;
  } | null;
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
  paintEstimate,
}: Props) {
  const t = useTranslations("templateDetail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
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

  const partsById = useMemo(
    () => new Map(parts.map((p) => [p.id, p])),
    [parts],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const knownPartIds = useMemo(
    () => new Set(parts.map((p) => p.id)),
    [parts],
  );

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

  // Staged picks live only in local state until "Save changes" — warn before
  // navigating away with unsaved edits (Dennis lost a whole recipe this way).
  useUnsavedChangesGuard(dirty, t("unsavedGuard"));

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

  // What the bike costs us to build: sum of last landed purchase costs.
  // Rows without purchase history are counted as "uncosted" so the gap is
  // visible rather than silently understating the figure.
  const costTotal = useMemo(() => {
    let sum = 0;
    let uncosted = 0;
    for (const r of rows) {
      const qty = Number(r.quantity);
      if (r.costDkk == null) uncosted += 1;
      else if (Number.isFinite(qty)) sum += qty * r.costDkk;
    }
    return { sum, uncosted };
  }, [rows]);

  function onPickFromCategory(
    category: CategoryOption,
    partId: string,
    quantity = 1,
  ) {
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
        quantity: String(quantity),
        isOptional: false,
        notes: "",
        retailDkk: part.retailDkk,
        costDkk: part.costDkk,
      },
    ]);
    // Reset the picker so it reads the placeholder again, ready for another.
    setPickerValueByCat((prev) => ({ ...prev, [category.id]: "__placeholder__" }));
    setSuccess(null);
  }

  // One-shot copy of a kit's parts into the (unsaved) recipe — the mirror
  // of the "label this BOM" action. No linkage: later kit edits don't touch
  // the template, and vice versa. Nothing hits the DB until Save changes.
  async function onAddKitParts(
    kitId: string,
    addablePartIds: string[],
  ): Promise<KitAddOutcome> {
    const addable = addablePartIds
      .map((id) => partsById.get(id))
      .filter((p): p is PartInCategory => p != null);
    const alreadyIn = (kitParts[kitId] ?? []).filter((id) =>
      inRecipePartIds.has(id),
    ).length;
    setRows((prev) => [
      ...prev,
      ...addable.map((part) => ({
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
        costDkk: part.costDkk,
      })),
    ]);
    setSuccess(null);
    return { added: addable.length, alreadyIn };
  }

  // Throw away unsaved edits — back to the recipe as last saved. Purely
  // client state, so this is the undo for stray picks / kit adds.
  function onDiscard() {
    setRows(initialRows);
    setPickerValueByCat({});
    setError(null);
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
      setSuccess(t("recipeSaved"));
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
    <Panel
      title={t("recipeTitle")}
      description={
        <>
          {t("recipeParts", { count: rows.length })} ·{" "}
          {t("recipeUnits", { count: totalUnitsPerBike })}
          {rows.length > 0 ? (
            <>
              {" · "}
              <span className="text-ink font-medium tabular-nums">
                {t("partsCostInline", { amount: formatDkk(costTotal.sum) })}
              </span>
              {costTotal.uncosted > 0
                ? ` ${t("uncostedN", { count: costTotal.uncosted })}`
                : null}
              {" · "}
              <span className="tabular-nums">
                {t("partsRetailInline", {
                  amount: formatDkk(retailTotal.sum),
                })}
              </span>
              {retailTotal.unpriced > 0
                ? ` ${t("unpricedN", { count: retailTotal.unpriced })}`
                : null}
              {templateRetailDkk != null ? (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {t("salePriceInline", {
                      amount: formatDkk(templateRetailDkk),
                    })}
                  </span>
                  {" · "}
                  <span
                    className={`tabular-nums ${
                      templateRetailDkk - retailTotal.sum < 0
                        ? "text-alert font-medium"
                        : ""
                    }`}
                  >
                    {t("retailDifferenceInline", {
                      amount: formatDkk(templateRetailDkk - retailTotal.sum),
                    })}
                  </span>
                </>
              ) : null}
            </>
          ) : null}
        </>
      }
      action={
        canEdit ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDiscard}
              disabled={isPending || !dirty}
            >
              {t("discard")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSave}
              disabled={isPending || !dirty}
            >
              {isPending ? tCommon("saving") : t("saveChanges")}
            </Button>
          </div>
        ) : null
      }
    >
      <div>
        {!canEdit ? (
          <p className="bg-ground text-ink-2 mb-3 rounded-md px-3 py-2 text-xs">
            {t("pastVersionNote")}
          </p>
        ) : null}

        {error ? (
          <p className="text-destructive mb-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mb-3 text-sm text-good" role="status">
            {success}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* LEFT: Categories */}
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
              {t("partsByCategory")}
            </div>

            {canEdit ? (
              <KitBulkAdd
                kits={kits}
                kitParts={kitParts}
                addedIds={inRecipePartIds}
                knownPartIds={knownPartIds}
                onAdd={onAddKitParts}
                disabled={!canEdit}
              />
            ) : null}

            {populated.map((category, index) => (
              <CategoryChecklistRow
                key={category.id}
                index={index + 1}
                label={localizedName(locale, category.name_en, category.name_da)}
                parts={(partsByCategory.get(category.id) ?? []).map((p) => ({
                  id: p.id,
                  sku: p.internal_sku,
                  name: p.name_en,
                  meta: p.retailDkk != null ? formatDkk(p.retailDkk) : null,
                }))}
                addedIds={inRecipePartIds}
                pickedCount={pickedByCategory.get(category.id) ?? 0}
                selectValue={
                  pickerValueByCat[category.id] ?? "__placeholder__"
                }
                onSelectValue={(v) =>
                  setPickerValueByCat((prev) => ({ ...prev, [category.id]: v }))
                }
                onPick={(partId, qty) =>
                  onPickFromCategory(category, partId, qty)
                }
                disabled={!canEdit}
              />
            ))}

            {empty.length > 0 ? (
              <div className="border-rule mt-2 rounded-md border border-dashed">
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
                    {t("emptyCategories", { count: empty.length })}
                  </span>
                </button>
                {showEmpty ? (
                  <ul className="text-muted-foreground border-t px-3 py-2 text-xs">
                    {empty.map((c, i) => (
                      <li key={c.id} className="py-0.5">
                        {populated.length + i + 1}.{" "}
                        {localizedName(locale, c.name_en, c.name_da)}
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
              {t("selectedParts")}
            </div>
            {rows.length === 0 ? (
              <div className="text-ink-3 bg-ground flex h-32 items-center justify-center rounded-md text-sm italic">
                {t("pickFromLeft")}
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
                      catRows[0]?.categoryName ?? t("uncategorised");
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
                        className="border-rule overflow-hidden rounded-md border"
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

                {/* Cost to produce + margin sanity-check, live while composing.
                    Cost = last landed purchase cost + the paintwork estimate
                    (per-bike, default painter's current list); retail = parts'
                    customer prices; margin compares the template sale price to
                    the full produce cost. An unpriceable paint estimate falls
                    back to parts only rather than mixing currencies. */}
                <div className="bg-ground flex flex-col gap-1 rounded-md px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className={paintEstimate ? "" : "font-medium"}>
                      {t("partsCostLabel")}
                      {costTotal.uncosted > 0 ? (
                        <span className="text-muted-foreground text-xs">
                          {" "}
                          {t("uncostedN", { count: costTotal.uncosted })}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`tabular-nums ${paintEstimate ? "" : "font-semibold"}`}
                    >
                      {formatDkk(costTotal.sum)}
                    </span>
                  </div>
                  {paintEstimate ? (
                    <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                      <span>
                        {paintEstimate.listLabel
                          ? t("paintEstimatedWithList", {
                              list: paintEstimate.listLabel,
                            })
                          : t("paintEstimated")}
                      </span>
                      <span className="tabular-nums">
                        {paintEstimate.totalDkk != null
                          ? formatDkk(paintEstimate.totalDkk)
                          : (paintEstimate.totalLabel ?? "—")}
                      </span>
                    </div>
                  ) : null}
                  {paintEstimate?.totalDkk != null ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{t("costToProduce")}</span>
                      <span className="font-semibold tabular-nums">
                        {formatDkk(costTotal.sum + paintEstimate.totalDkk)}
                      </span>
                    </div>
                  ) : null}
                  {templateRetailDkk != null ? (
                    <div
                      className={`flex items-center justify-between gap-2 text-xs ${
                        templateRetailDkk -
                          (costTotal.sum + (paintEstimate?.totalDkk ?? 0)) <
                        0
                          ? "text-destructive font-medium"
                          : "text-good"
                      }`}
                    >
                      <span>{t("marginLabel")}</span>
                      <span className="tabular-nums">
                        {formatDkk(
                          templateRetailDkk -
                            (costTotal.sum + (paintEstimate?.totalDkk ?? 0)),
                        )}
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-1 flex items-center justify-between gap-2 border-t pt-1">
                    <span>
                      {t("partsRetailTotal")}
                      {retailTotal.unpriced > 0 ? (
                        <span className="text-muted-foreground text-xs">
                          {" "}
                          {t("unpricedN", { count: retailTotal.unpriced })}
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
                        <span>{t("templateSalePrice")}</span>
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
                        <span>{t("differenceLabel")}</span>
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
              onClick={onDiscard}
              disabled={isPending || !dirty}
              title={t("discardTitle")}
            >
              {t("discard")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onSaveAsVersion}
              disabled={isPending || rows.length === 0}
              title={t("saveAsVersionTitle")}
            >
              <GitBranch aria-hidden /> {t("saveAsVersion")}
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={isPending || !dirty}
            >
              {isPending ? tCommon("saving") : t("saveChanges")}
            </Button>
          </div>
        ) : null}
      </div>
    </Panel>
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
  const t = useTranslations("templateDetail");
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
        aria-label={t("qtyDecreaseAria", { sku: partSku })}
      >
        <Minus className="size-3" aria-hidden />
      </Button>
      <span
        className="min-w-7 px-1 text-center tabular-nums"
        aria-label={t("qtyAria", { sku: partSku })}
      >
        {value}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-6 rounded-l-none"
        onClick={() => step(1)}
        aria-label={t("qtyIncreaseAria", { sku: partSku })}
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
  const t = useTranslations("templateDetail");
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
              aria-label={t("removeAria", { sku: row.partSku })}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{t("qty")}</span>
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
          <span className="text-muted-foreground">{t("optional")}</span>
        </label>
        {canEdit ? (
          <Input
            value={row.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder={t("notesPlaceholder")}
            className="h-7 flex-1 text-xs"
            aria-label={t("notesAria", { sku: row.partSku })}
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
