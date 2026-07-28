"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { CategoryChecklistRow } from "@/components/recipe/category-checklist-row";
import { KitBulkAdd, type KitOption } from "@/components/recipe/kit-bulk-add";
import { formatQuantity } from "@/lib/parts/stock";

import {
  addKitPartsToMO,
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
  /** Active kits + their part ids, for the "add a whole kit" bulk action. */
  kits: KitOption[];
  kitParts: Record<string, string[]>;
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
  kits,
  kitParts,
  hasTemplate,
  readOnly,
}: Props) {
  const t = useTranslations("moDetail");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [substitute, setSubstitute] = useState<SubstituteState | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [pickerValueByCat, setPickerValueByCat] = useState<
    Record<string, string>
  >({});
  const [, startAdd] = useTransition();

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

  const knownPartIds = useMemo(
    () => new Set(catalog.map((p) => p.id)),
    [catalog],
  );

  // Recipe rows per category — drives the checklist's green done-state.
  const pickedByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (!r.categoryId) continue;
      m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  function onPickFromCategory(categoryId: string, partId: string, quantity = 1) {
    if (!partId || partId === "__placeholder__") return;
    setError(null);
    startAdd(async () => {
      const r = await addMOPart(moId, partId, quantity);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPickerValueByCat((prev) => ({
        ...prev,
        [categoryId]: "__placeholder__",
      }));
      router.refresh();
    });
  }

  async function onAddKit(kitId: string) {
    const r = await addKitPartsToMO(moId, kitId);
    if (!r.ok) return { error: r.error };
    router.refresh();
    return { added: r.added, alreadyIn: r.skipped };
  }

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
      title={t("partsRecipeTitle")}
      description={
        hasTemplate
          ? t("partsRecipeDescTemplate")
          : t("partsRecipeDescOneOff")
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
            {t("partsByCategory")}
          </div>
          {!readOnly ? (
            <KitBulkAdd
              kits={kits}
              kitParts={kitParts}
              addedIds={onMoPartIds}
              knownPartIds={knownPartIds}
              onAdd={onAddKit}
              disabled={readOnly}
            />
          ) : null}
          {populated.map((category, index) => (
            <CategoryChecklistRow
              key={category.id}
              index={index + 1}
              label={category.name_en}
              parts={(partsByCategory.get(category.id) ?? []).map((p) => ({
                id: p.id,
                sku: p.internal_sku,
                name: p.name_en,
                meta: t("onHandMeta", { qty: formatQuantity(p.onHand) }),
                metaDanger: p.onHand <= 0,
              }))}
              addedIds={onMoPartIds}
              pickedCount={pickedByCategory.get(category.id) ?? 0}
              selectValue={pickerValueByCat[category.id] ?? "__placeholder__"}
              onSelectValue={(v) =>
                setPickerValueByCat((prev) => ({ ...prev, [category.id]: v }))
              }
              onPick={(partId, qty) =>
                onPickFromCategory(category.id, partId, qty)
              }
              disabled={readOnly}
            />
          ))}

          {empty.length > 0 ? (
            <div className="bg-ground mt-2 rounded-lg">
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
            <span>{t("selectedParts")}</span>
            <span className="text-muted-foreground text-[10px] normal-case tracking-normal">
              {t("xOutstanding", { count: outstandingBikes })}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="text-ink-3 bg-ground flex h-32 items-center justify-center rounded-lg text-sm italic">
              {t("noPartsYet")}
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
                    catRows[0]?.categoryName ?? t("uncategorised");
                  return (
                    <div
                      key={catKey}
                      className="bg-ground overflow-hidden rounded-lg"
                    >
                      <div className="border-rule border-b px-3 py-1.5 text-xs font-medium uppercase tracking-wide">
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
  const t = useTranslations("moDetail");
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
              {t("replaces", { name: row.substitutedFromPartName })}
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
          {t("totalNeed")}{" "}
          <span className="tabular-nums">{formatQuantity(totalNeeded)}</span>
        </span>
        <span className="text-muted-foreground">
          {t("onHandLabel")}{" "}
          <span className="tabular-nums">{formatQuantity(row.onHand)}</span>
        </span>
        <span
          className={`tabular-nums ${
            shortfall > 0
              ? "text-destructive font-medium"
              : "text-good"
          }`}
        >
          {shortfall > 0
            ? t("shortfallLabel", { qty: formatQuantity(shortfall) })
            : t("stocked")}
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
  const t = useTranslations("moDetail");
  const router = useRouter();
  const [value, setValue] = useState(String(row.quantityPerBike));
  const [pending, start] = useTransition();

  function commit() {
    const next = Number(value.replace(",", "."));
    if (!Number.isFinite(next) || next <= 0) {
      setValue(String(row.quantityPerBike));
      onError(t("errQtyPositive"));
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
        {t("qtyPerBikeReadonly")}{" "}
        <span className="text-foreground tabular-nums">
          {formatQuantity(row.quantityPerBike)}
        </span>
      </span>
    );
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{t("qtyPerBikeLabel")}</span>
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
        aria-label={t("qtyPerBikeAria", { sku: row.partSku })}
      />
    </label>
  );
}

function OriginBadge({ origin }: { origin: MOPartRow["origin"] }) {
  const t = useTranslations("moDetail");
  if (origin === "template") {
    return (
      <Badge variant="outline" className="font-normal text-[10px]">
        {t("originTemplate")}
      </Badge>
    );
  }
  if (origin === "added") {
    return (
      <Badge variant="secondary" className="text-[10px]">
        {t("originAdded")}
      </Badge>
    );
  }
  if (origin === "substituted") {
    return (
      <Badge variant="warning" className="text-[10px]">
        {t("originSubstituted")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      {t("originModified")}
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
  const t = useTranslations("moDetail");
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
          aria-label={t("actionsAria", { sku: row.partSku })}
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
          <ArrowRightLeft aria-hidden /> {t("substitute")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!removable || pending}
          title={!removable ? t("templateRemoveTitle") : undefined}
          onSelect={(e) => {
            e.preventDefault();
            if (!removable) return;
            if (confirmRemove) runRemove();
            else setConfirmRemove(true);
          }}
        >
          <Trash2 aria-hidden />{" "}
          {confirmRemove ? t("clickAgainConfirm") : t("remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
