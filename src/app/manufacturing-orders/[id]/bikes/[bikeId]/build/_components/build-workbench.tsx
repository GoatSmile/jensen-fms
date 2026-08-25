"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Lock,
  ScanLine,
  Tag,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
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
import { localizedName } from "@/i18n/vocab";
import { CategoryChecklistRow } from "@/components/recipe/category-checklist-row";
import { KitBulkAdd, type KitOption } from "@/components/recipe/kit-bulk-add";
import { kitCode, stickerColor } from "@/lib/kits/colors";
import { BIKE_STATUS_VARIANT, type BikeStatus } from "@/lib/bikes/status";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { IdentifierDialog } from "@/app/bikes/[id]/_components/identifier-dialog";
import type { IdentifierTypeOption } from "@/app/bikes/[id]/_components/identifier-dialog";

import {
  addBikePart,
  bulkAddPartsByKit,
  clearBikeBuildParts,
  copyMoRecipeToBike,
  removeBikePart,
  removeBikePartsByKit,
  updateBikePartQuantity,
} from "../_actions/manage-bike-parts";
import { finishBikeBuild } from "../_actions/finish-build";
import { confirmBikeFrame } from "../_actions/confirm-frame";

export type WorkbenchIdentifierRow = {
  id: string;
  typeName: string;
  typeSlug: string;
  value: string;
};

export type CategoryOption = {
  id: string;
  name_en: string;
  name_da?: string | null;
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
  /** Whether the real frame number has been confirmed (gates Finish). */
  frameConfirmed: boolean;
  /**
   * Non-null when the frame is at the painter (Tier 2 Phase C) — blocks Finish
   * with this human reason until the paint order is received back.
   */
  atPainterReason: string | null;
  /** Build-floor labeling note from the bike's sales order (Phase D). */
  buildNote: string | null;
  bikeStatus: BikeStatus;
  templateLabel: string | null;
  colorName: string | null;
  colorHex: string | null;
  /**
   * Who can be named as the builder. The mechanic who did the work often is
   * not the one at the keyboard (migration 83), so this is a choice, not the
   * session person — but it DEFAULTS to whoever is logged in, so the common
   * case costs nothing.
   */
  peopleOptions: { id: string; full_name: string }[];
  defaultBuiltById: string | null;
  initialBikeParts: BikePartRow[];
  categories: CategoryOption[];
  catalog: PartInCatalog[];
  /** Active kits + their part ids, for the "add / remove a whole kit" actions. */
  kits: KitOption[];
  kitParts: Record<string, string[]>;
  /** How many parts are in the MO recipe — used for the "Copy recipe" CTA. */
  moRecipeRowCount: number;
  /** Identifier types pickable in the in-build "add identifier" dialog. */
  identifierTypes: IdentifierTypeOption[];
  /** Active identifiers already on this bike. */
  identifiers: WorkbenchIdentifierRow[];
  requiredIdentifierCount: number;
  requiredRegisteredCount: number;
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
  frameConfirmed,
  atPainterReason,
  buildNote,
  bikeStatus,
  templateLabel,
  colorName,
  colorHex,
  peopleOptions,
  defaultBuiltById,
  initialBikeParts,
  categories,
  catalog,
  kits,
  kitParts,
  moRecipeRowCount,
  identifierTypes,
  identifiers,
  requiredIdentifierCount,
  requiredRegisteredCount,
  readOnly,
  pickListSlot,
}: Props) {
  const t = useTranslations("build");
  const tStatus = useTranslations("bikeStatus");
  const tCommon = useTranslations("common");
  // Defaults to the session person: the common case is that whoever is
  // finishing the build did it. Changing it is one tap.
  const [builtBy, setBuiltBy] = useState<string | null>(defaultBuiltById);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  // Two-step arm for the destructive "Clear build" (no modal — label flips to
  // "Confirm…" on first click, matching the app's inline-friction convention).
  const [clearArmed, setClearArmed] = useState(false);
  const [pickerValueByCat, setPickerValueByCat] = useState<
    Record<string, string>
  >({});
  const [isFinishing, startFinish] = useTransition();
  const [isSeeding, startSeed] = useTransition();

  // Frame confirmation (the "Identify" step). Local state so the panel reflects
  // the confirm immediately; router.refresh re-syncs the rest of the page.
  const [frameValue, setFrameValue] = useState(bikeFrameNumber);
  const [confirmed, setConfirmed] = useState(frameConfirmed);
  const [isConfirming, startConfirm] = useTransition();

  const rows = initialBikeParts;
  const isEmpty = rows.length === 0;

  // The frame has its own dedicated control above; list only the rest.
  const otherIdentifiers = useMemo(
    () => identifiers.filter((i) => i.typeSlug !== "frame_number"),
    [identifiers],
  );

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

  // Catalog ids the kit-add control treats as "known" (kit members outside
  // the catalog are ignored).
  const knownPartIds = useMemo(
    () => new Set(catalog.map((p) => p.id)),
    [catalog],
  );

  // Recipe rows per category — drives the green-checklist done-state.
  const pickedByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (!r.categoryId) continue;
      m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  // Not-yet-consumed parts: what "clear build" / "remove kit" can act on.
  // Consumed rows are frozen and excluded.
  const removablePartIds = useMemo(
    () => new Set(rows.filter((r) => !r.consumed).map((r) => r.partId)),
    [rows],
  );
  const removableCount = useMemo(
    () => rows.filter((r) => !r.consumed).length,
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
    setClearArmed(false);
    startSeed(async () => {
      const r = await copyMoRecipeToBike(moId, bikeId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(t("recipeCopied"));
      router.refresh();
    });
  }

  function onPickFromCategory(
    categoryId: string,
    partId: string,
    quantity = 1,
  ) {
    if (!partId || partId === "__placeholder__") return;
    setError(null);
    setSuccess(null);
    setClearArmed(false);
    startSeed(async () => {
      const r = await addBikePart(moId, bikeId, partId, quantity);
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
    setError(null);
    setSuccess(null);
    setClearArmed(false);
    const r = await bulkAddPartsByKit(moId, bikeId, kitId);
    if (!r.ok) return { error: r.error };
    router.refresh();
    return { added: r.added, alreadyIn: r.skipped };
  }

  async function onRemoveKit(
    kitId: string,
  ): Promise<{ error: string } | { removed: number; kept: number }> {
    setError(null);
    setSuccess(null);
    setClearArmed(false);
    const r = await removeBikePartsByKit(moId, bikeId, kitId);
    if (!r.ok) return { error: r.error };
    router.refresh();
    return { removed: r.removed, kept: r.kept };
  }

  function onClearBuild() {
    // First click arms; second click within the same armed state clears.
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setClearArmed(false);
    setError(null);
    setSuccess(null);
    startSeed(async () => {
      const r = await clearBikeBuildParts(moId, bikeId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(
        t("clearedParts", { count: r.removed }) +
          (r.kept > 0 ? t("clearedKept", { count: r.kept }) : ""),
      );
      router.refresh();
    });
  }

  function onConfirmFrame() {
    setError(null);
    setSuccess(null);
    setClearArmed(false);
    startConfirm(async () => {
      const r = await confirmBikeFrame(moId, bikeId, frameValue);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setFrameValue(r.frameNumber);
      setConfirmed(true);
      setSuccess(t("frameConfirmedMsg", { frame: r.frameNumber }));
      router.refresh();
    });
  }

  function onFinish() {
    setError(null);
    setSuccess(null);
    setClearArmed(false);
    startFinish(async () => {
      const r = await finishBikeBuild(moId, bikeId, { builtBy });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirmOpen(false);
      setSuccess(t("buildFinished", { count: r.partsConsumed }));
      router.refresh();
    });
  }

  // Shared by the top + footer "Finish build" buttons.
  const finishDisabled =
    isFinishing ||
    isSeeding ||
    isConfirming ||
    rows.length === 0 ||
    !confirmed ||
    !!atPainterReason;

  return (
    <div className="flex flex-col gap-6">
      {/* Header card with bike identity + status + actions */}
      <Panel contentClassName="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">
              MO{" "}
              <Link
                href={`/manufacturing-orders/${moId}`}
                className="font-mono hover:underline"
              >
                {moNumber}
              </Link>
            </span>
            <Badge variant={BIKE_STATUS_VARIANT[bikeStatus] ?? "outline"}>
              {tStatus(bikeStatus)}
            </Badge>
            {colorName ? (
              <ColorChip hex={colorHex} label={colorName} />
            ) : (
              <Badge variant="outline" className="font-normal italic">
                {t("unpainted")}
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
        {!readOnly ? (
          <Button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={finishDisabled}
          >
            <CheckCircle2 aria-hidden />
            {isFinishing ? t("finishing") : t("finishBuild")}
          </Button>
        ) : null}
      </Panel>

      {/* Build-floor labeling note from the sales order (Tier 2 Phase D). */}
      {buildNote ? (
        <Panel hue="money" contentClassName="flex items-start gap-2">
          <Tag className="mt-0.5 size-4 shrink-0 text-money" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-money">
              {t("productionNote")}
            </span>
            <p className="text-sm whitespace-pre-wrap text-money">
              {buildNote}
            </p>
          </div>
        </Panel>
      ) : null}

      {/* Identify: confirm the real frame number + register identifiers. */}
      {!readOnly ? (
        <Panel
          title={t("frameSectionTitle")}
          description={
            confirmed ? t("frameConfirmedHint") : t("frameEnterHint")
          }
          action={
            confirmed ? (
              <Badge variant="success">
                <CheckCircle2 aria-hidden className="size-3.5" />{" "}
                {t("frameConfirmedBadge")}
              </Badge>
            ) : (
              <Badge variant="warning">{t("provisionalBadge")}</Badge>
            )
          }
          contentClassName="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="frame-confirm"
                className="text-xs font-medium tracking-wide"
              >
                {t("frameNumberLabel")}
              </label>
              <div className="relative">
                <ScanLine
                  aria-hidden
                  className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
                />
                <Input
                  id="frame-confirm"
                  value={frameValue}
                  onChange={(e) => setFrameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (frameValue.trim() !== "") onConfirmFrame();
                    }
                  }}
                  disabled={isConfirming}
                  className="w-[240px] pl-8 font-mono"
                  aria-label={t("realFrameAria")}
                />
              </div>
            </div>
            <Button
              type="button"
              variant={confirmed ? "outline" : "default"}
              onClick={onConfirmFrame}
              disabled={isConfirming || frameValue.trim() === ""}
            >
              {isConfirming
                ? t("saving")
                : confirmed
                  ? t("updateFrame")
                  : t("confirmFrame")}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {t("otherIdentifiers", { count: otherIdentifiers.length })}
              </span>
              {requiredIdentifierCount > 0 ? (
                <span
                  className={`text-xs tabular-nums ${
                    requiredRegisteredCount < requiredIdentifierCount
                      ? "text-money"
                      : "text-muted-foreground"
                  }`}
                >
                  {t("requiredCount", {
                    registered: requiredRegisteredCount,
                    required: requiredIdentifierCount,
                  })}
                </span>
              ) : null}
            </div>
            {otherIdentifiers.length > 0 ? (
              <ul className="divide-rule divide-y text-sm">
                {otherIdentifiers.map((id) => (
                  <li
                    key={id.id}
                    className="flex items-center justify-between gap-2 px-3 py-1.5"
                  >
                    <span className="text-muted-foreground text-xs">
                      {id.typeName}
                    </span>
                    <span className="font-mono text-xs">{id.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2 bg-ground rounded-lg px-3 py-2 text-xs italic">
                {t("noIdentifiers")}
              </p>
            )}
            <div>
              <IdentifierDialog
                bikeId={bikeId}
                identifierTypes={identifierTypes}
                extraRevalidatePaths={[
                  `/manufacturing-orders/${moId}/bikes/${bikeId}/build`,
                ]}
              />
            </div>
          </div>
        </Panel>
      ) : null}

      {pickListSlot}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-good" role="status">
          {success}
        </p>
      ) : null}

      {/* Workbench: categories left, this bike's parts right */}
      <Panel
        title={t("partsTitle")}
        description={t.rich("partsHint", {
          frame: bikeFrameNumber,
          mono: (chunks) => <span className="font-mono">{chunks}</span>,
          b: (chunks) => <strong>{chunks}</strong>,
        })}
        action={
          !readOnly ? (
            <div className="flex flex-wrap items-center gap-2">
              {isEmpty && moRecipeRowCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCopyRecipe}
                  disabled={isSeeding}
                >
                  <Copy aria-hidden />{" "}
                  {t("copyRecipe", { count: moRecipeRowCount })}
                </Button>
              ) : null}
              {removableCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClearBuild}
                  disabled={isSeeding || isFinishing}
                  className={
                    clearArmed
                      ? "border-destructive text-destructive hover:text-destructive"
                      : undefined
                  }
                >
                  <Trash2 aria-hidden />
                  {clearArmed
                    ? t("clearArmed", { count: removableCount })
                    : t("clearBuild")}
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        <div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* LEFT: Category picker (hidden in read-only mode) */}
            {readOnly ? (
              <div className="text-ink-2 bg-ground hidden flex-col items-center justify-center rounded-lg p-6 text-sm italic lg:flex">
                <Lock className="size-5" aria-hidden />
                {t("pickerLocked")}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
                  {t("partsByCategory")}
                </div>
                <KitBulkAdd
                  kits={kits}
                  kitParts={kitParts}
                  addedIds={inBikePartIds}
                  knownPartIds={knownPartIds}
                  onAdd={onAddKit}
                  disabled={isSeeding || isFinishing}
                />
                <KitBulkRemove
                  kits={kits}
                  kitParts={kitParts}
                  removablePartIds={removablePartIds}
                  onRemove={onRemoveKit}
                  disabled={isSeeding || isFinishing}
                />
                {populated.map((category, index) => (
                  <CategoryChecklistRow
                    key={category.id}
                    index={index + 1}
                    label={localizedName(
                      locale,
                      category.name_en,
                      category.name_da,
                    )}
                    parts={(partsByCategory.get(category.id) ?? []).map(
                      (p) => ({
                        id: p.id,
                        sku: p.internal_sku,
                        name: p.name_en,
                        meta: t("onHandMeta", {
                          qty: formatQuantity(p.onHand),
                        }),
                        metaDanger: p.onHand <= 0,
                      }),
                    )}
                    addedIds={inBikePartIds}
                    pickedCount={pickedByCategory.get(category.id) ?? 0}
                    selectValue={
                      pickerValueByCat[category.id] ?? "__placeholder__"
                    }
                    onSelectValue={(v) =>
                      setPickerValueByCat((prev) => ({
                        ...prev,
                        [category.id]: v,
                      }))
                    }
                    onPick={(partId, qty) =>
                      onPickFromCategory(category.id, partId, qty)
                    }
                    disabled={readOnly || isSeeding || isFinishing}
                  />
                ))}
                {empty.length > 0 ? (
                  <div className="bg-ground mt-2 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setShowEmpty((v) => !v)}
                      className="hover:bg-rule/30 flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
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
                      <ul className="text-ink-2 border-rule border-t px-3 py-2 text-xs">
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
            )}

            {/* RIGHT: this bike's parts */}
            <div
              className={`flex flex-col gap-2 ${readOnly ? "lg:col-span-2" : ""}`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  {t("selectedParts", { count: rows.length })}
                </span>
                {rows.length > 0 ? (
                  <span className="text-xs tabular-nums">
                    {t("retailTotal")}{" "}
                    <span className="font-semibold">
                      {formatDkk(retailTotal.sum)}
                    </span>
                    {retailTotal.unpriced > 0 ? (
                      <span className="text-muted-foreground">
                        {" "}
                        {t("unpricedSuffix", { count: retailTotal.unpriced })}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
              {isEmpty ? (
                <div className="text-ink-2 bg-ground flex h-32 items-center justify-center rounded-lg text-sm italic">
                  {readOnly
                    ? t("emptyReadOnly")
                    : moRecipeRowCount > 0
                      ? t("emptyWithRecipe")
                      : t("emptyNoRecipe")}
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
                          <div className="bg-rule/40 px-3 py-1.5 text-xs font-medium tracking-wide uppercase">
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
          <footer className="bg-ground mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg p-3">
            <p
              className={`text-xs ${atPainterReason ? "text-money" : "text-muted-foreground"}`}
            >
              {atPainterReason
                ? atPainterReason
                : !confirmed
                  ? t("footerConfirmFirst")
                  : rows.length === 0
                    ? t("footerAddParts")
                    : t("footerReady", { count: rows.length })}
            </p>
            <Button
              type="button"
              size="lg"
              onClick={() => setConfirmOpen(true)}
              disabled={finishDisabled}
            >
              <CheckCircle2 aria-hidden />{" "}
              {isFinishing ? t("finishing") : t("finishBuild")}
            </Button>
          </footer>
        ) : null}
      </Panel>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finishConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("finishConfirmBody", { count: rows.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="built-by">{t("builtBy")}</Label>
            <Select
              value={builtBy ?? ""}
              onValueChange={(v) => setBuiltBy(v || null)}
            >
              <SelectTrigger id="built-by">
                <SelectValue placeholder={t("builtByUnknown")} />
              </SelectTrigger>
              <SelectContent>
                {peopleOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{t("builtByHint")}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={onFinish} disabled={isFinishing}>
              {isFinishing ? t("finishing") : t("finishBuild")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * "Remove a whole kit" — the inverse of the shared KitBulkAdd, build-specific.
 * Lists only kits with not-yet-consumed parts on this bike; one button removes
 * them. Consumed parts are frozen and left behind (reported as "kept").
 */
function KitBulkRemove({
  kits,
  kitParts,
  removablePartIds,
  onRemove,
  disabled,
}: {
  kits: KitOption[];
  kitParts: Record<string, string[]>;
  /** Bike part ids that can still be removed (not yet consumed). */
  removablePartIds: Set<string>;
  onRemove: (
    kitId: string,
  ) => Promise<{ error: string } | { removed: number; kept: number }>;
  disabled?: boolean;
}) {
  const t = useTranslations("build");
  const [kitId, setKitId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const removableForKit = (id: string) =>
    (kitParts[id] ?? []).filter((p) => removablePartIds.has(p)).length;

  const applicableKits = useMemo(
    () => kits.filter((k) => removableForKit(k.id) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- removableForKit closes over kitParts + removablePartIds, both in deps
    [kits, kitParts, removablePartIds],
  );
  const count = kitId ? removableForKit(kitId) : 0;

  if (applicableKits.length === 0) return null;

  function runRemove() {
    const kit = applicableKits.find((k) => k.id === kitId);
    if (!kit || count === 0) return;
    setNote(null);
    setError(null);
    start(async () => {
      const outcome = await onRemove(kit.id);
      if ("error" in outcome) {
        setError(outcome.error);
        return;
      }
      const code = kitCode(kit.sticker_color, kit.kit_number);
      setNote(
        t("removedNote", { count: outcome.removed, code }) +
          (outcome.kept > 0 ? t("removedKept", { count: outcome.kept }) : ""),
      );
      setKitId("");
    });
  }

  return (
    <div className="bg-ground mb-1 rounded-lg px-2.5 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground shrink-0 text-xs">
          {t("removeKitLabel")}
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
              {applicableKits.map((k) => (
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
                    {removableForKit(k.id)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runRemove}
            disabled={disabled || isPending || !kitId || count === 0}
          >
            <Trash2 aria-hidden />
            {isPending
              ? t("removing")
              : kitId
                ? t("removeCount", { count })
                : t("removeParts")}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="text-destructive mt-1.5 text-xs" role="alert">
          {error}
        </p>
      ) : note ? (
        <p className="mt-1.5 text-xs text-good" role="status">
          {note}
        </p>
      ) : null}
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
  const t = useTranslations("build");
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
      onError(t("qtyPositive"));
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
              {t("consumedBadge")}
            </Badge>
          ) : null}
          {!frozen ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={runRemove}
              disabled={pending}
              aria-label={t("removeAria", { sku: row.partSku })}
              title={t("removeTitle")}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{t("qtyLabel")}</span>
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
              aria-label={t("qtyForAria", { sku: row.partSku })}
            />
          ) : (
            <span className="tabular-nums">{formatQuantity(row.quantity)}</span>
          )}
        </label>
        <span className="text-muted-foreground">
          {t("onHandLabel")}{" "}
          <span className="tabular-nums">{formatQuantity(row.onHand)}</span>
        </span>
        <span
          className={`tabular-nums ${
            shortfall > 0 ? "text-destructive font-medium" : "text-good"
          }`}
        >
          {shortfall > 0
            ? t("shortBy", { qty: formatQuantity(shortfall) })
            : t("stocked")}
        </span>
        <span className="text-muted-foreground ml-auto tabular-nums">
          {row.retailDkk != null
            ? `${formatDkk(row.quantity * row.retailDkk)}`
            : t("noRetailPrice")}
        </span>
      </div>
    </li>
  );
}
