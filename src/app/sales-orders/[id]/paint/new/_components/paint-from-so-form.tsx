"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ColorSwatch } from "@/components/color-swatch";
import { colorFinishLabel } from "@/lib/colors/coating";
import { localizedName } from "@/i18n/vocab";
import { BIKE_STATUS_VARIANT, type BikeStatus } from "@/lib/bikes/status";
import type {
  ColorOption,
  SupplierOption,
} from "@/app/paint-orders/_components/paint-order-form";

import {
  addSOBikesToPaintOrder,
  createPaintOrderFromSO,
} from "@/app/sales-orders/_actions/paint-from-so";
import {
  fallbackStarterLines,
  planPaintSeed,
  type SeedBike,
  type SeedRecipePart,
  type SeedTemplateRow,
} from "@/lib/services/paint-seed";

import {
  PaintworkPreview,
  type PreviewPart,
  type PreviewPartType,
  type PreviewPriceList,
} from "./paintwork-preview";

export type EligibleSOBike = {
  id: string;
  frameNumber: string;
  /** null for a bike recorded outside an MO — no recipe to send. */
  templateId: string | null;
  templateLabel: string | null;
  /** The bike's own colour, from its sales-order line — what it is painted in. */
  colorId: string | null;
  colorName: string | null;
  colorHex: string | null;
  status: BikeStatus;
};

/** Why no bike can be picked — each case has a different next step. */
export type EmptyReason = "noMo" | "allBuilt" | "allOnOrder";
export type BlockingOrder = { id: string; number: string; bikes: number };
/** A paint order for this SO that is still planned, so it can take more bikes. */
export type PlannedPaintOrder = {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string | null;
  bikeCount: number;
};

type Props = {
  soId: string;
  soNumber: string;
  eligibleBikes: EligibleSOBike[];
  suppliers: SupplierOption[];
  colors: ColorOption[];
  defaultSupplierId: string;
  /** Seed inputs from `loadPaintSeedInputs` — see PaintworkPreview. */
  seedBikes: SeedBike[];
  paintworkRows: SeedTemplateRow[];
  recipeParts: SeedRecipePart[];
  partTypes: PreviewPartType[];
  parts: PreviewPart[];
  priceLists: PreviewPriceList[];
  fallbackPartTypeIds: string[];
  emptyReason: EmptyReason;
  blockingOrders: BlockingOrder[];
  plannedOrders: PlannedPaintOrder[];
  /** Bike lines on the SO with no MO yet — their bikes don't exist to pick. */
  unspawnedLines: number;
};

const NEW = "new";

export function PaintFromSOForm({
  soId,
  soNumber,
  eligibleBikes,
  suppliers,
  colors,
  defaultSupplierId,
  seedBikes,
  paintworkRows,
  recipeParts,
  partTypes,
  parts,
  priceLists,
  fallbackPartTypeIds,
  emptyReason,
  blockingOrders,
  plannedOrders,
  unspawnedLines,
}: Props) {
  const t = useTranslations("soDetail");
  const tCommon = useTranslations("common");
  const tBikeStatus = useTranslations("bikeStatus");
  const locale = useLocale();
  const router = useRouter();
  // Default: every eligible bike selected.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(eligibleBikes.map((b) => b.id)),
  );
  // One paint job per sales order: while one is still planned, adding to it
  // is the default, and a second order is the deliberate choice.
  const [target, setTarget] = useState<string>(plannedOrders[0]?.id ?? NEW);
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [fallbackColorId, setFallbackColorId] = useState("");
  const [plannedSendDate, setPlannedSendDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const targetOrder = plannedOrders.find((o) => o.id === target) ?? null;
  const isNew = targetOrder == null;
  const effectiveSupplierId = targetOrder?.supplierId ?? supplierId;

  const allSelected =
    eligibleBikes.length > 0 && selected.size === eligibleBikes.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(
      allSelected ? new Set() : new Set(eligibleBikes.map((b) => b.id)),
    );

  const selectedCount = selected.size;
  // Stable array identity for the preview's useMemo — a fresh [...set] on
  // every render would recompute the plan on every keystroke in Notes.
  const selectedBikeIds = useMemo(
    () => eligibleBikes.filter((b) => selected.has(b.id)).map((b) => b.id),
    [eligibleBikes, selected],
  );
  // The colour question only exists for bikes that have no colour of their own.
  const colourlessSelected = useMemo(
    () => eligibleBikes.filter((b) => selected.has(b.id) && !b.colorId).length,
    [eligibleBikes, selected],
  );
  const colourById = useMemo(
    () =>
      new Map(
        colors.map((c) => [
          c.id,
          { name: localizedName(locale, c.name_en, c.name_da), hex: c.hex },
        ]),
      ),
    [colors, locale],
  );
  // What the order will actually contain — the count the submit button shows,
  // because "1 frame" was a bike count that read as "only the frame".
  const previewPartCount = useMemo(() => {
    const selectedSet = new Set(selectedBikeIds);
    const bikes = seedBikes
      .filter((b) => selectedSet.has(b.id))
      .map((b) => ({ ...b, colorId: b.colorId ?? (fallbackColorId || null) }));
    const plan = planPaintSeed(bikes, paintworkRows, recipeParts);
    const lines =
      plan.lines.length === 0 && isNew
        ? fallbackStarterLines(bikes, fallbackPartTypeIds)
        : plan.lines;
    return lines.reduce((sum, l) => sum + l.quantity, 0);
  }, [
    selectedBikeIds,
    seedBikes,
    fallbackColorId,
    paintworkRows,
    recipeParts,
    fallbackPartTypeIds,
    isNew,
  ]);

  function clearFieldError(field: string) {
    if (errorField === field) {
      setError(null);
      setErrorField(null);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    if (selected.size === 0) {
      setError(t("errPickBike"));
      return;
    }
    startTransition(async () => {
      const result = targetOrder
        ? await addSOBikesToPaintOrder({
            soId,
            serviceOrderId: targetOrder.id,
            bikeIds: [...selected],
            fallbackColorId: fallbackColorId || null,
          })
        : await createPaintOrderFromSO({
            soId,
            bikeIds: [...selected],
            supplierId,
            fallbackColorId: fallbackColorId || null,
            plannedSendDate: plannedSendDate || null,
            notes: notes || null,
          });
      // On success the action redirects, so we only get here on failure.
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  if (eligibleBikes.length === 0) {
    return (
      <NoBikes
        soId={soId}
        soNumber={soNumber}
        reason={emptyReason}
        blockingOrders={blockingOrders}
        unspawnedLines={unspawnedLines}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {unspawnedLines > 0 ? (
        <p
          className="bg-money-wash text-money rounded-lg px-4 py-3 text-sm"
          role="status"
        >
          {t.rich("paintUnspawnedLines", {
            count: unspawnedLines,
            so: soNumber,
            link: (chunks) => (
              <Link href={`/sales-orders/${soId}`} className="font-medium underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}

      {plannedOrders.length > 0 ? (
        <Panel
          title={t("paintTargetTitle")}
          description={t("paintTargetDesc")}
          contentClassName="flex flex-col gap-1"
        >
          {plannedOrders.map((o) => (
            <label
              key={o.id}
              className="hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-md px-3 py-2"
            >
              <input
                type="radio"
                name="paint-target"
                checked={target === o.id}
                onChange={() => setTarget(o.id)}
                className="accent-primary mt-0.5 size-4 shrink-0"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">
                  {t("paintTargetExisting", { number: o.number })}
                </span>
                <span className="text-ink-2 text-xs">
                  {t("paintTargetExistingMeta", {
                    supplier: o.supplierName ?? "—",
                    bikes: o.bikeCount,
                  })}
                </span>
              </span>
            </label>
          ))}
          <label className="hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-md px-3 py-2">
            <input
              type="radio"
              name="paint-target"
              checked={target === NEW}
              onChange={() => setTarget(NEW)}
              className="accent-primary mt-0.5 size-4 shrink-0"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{t("paintTargetNew")}</span>
              <span className="text-ink-2 text-xs">{t("paintTargetNewMeta")}</span>
            </span>
          </label>
        </Panel>
      ) : null}

      <Panel
        title={t("bikesInBatch")}
        description={t("bikesSelected", {
          selected: selectedCount,
          total: eligibleBikes.length,
        })}
        action={
          <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
            {allSelected ? tCommon("clearAll") : t("selectAll")}
          </Button>
        }
      >
        {/* The scroller stays on the list itself — it is the thing that overflows. */}
        <ul className="divide-rule max-h-80 divide-y overflow-y-auto">
          {eligibleBikes.map((b) => {
            const checked = selected.has(b.id);
            return (
              <li key={b.id}>
                <label className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(b.id)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-mono text-sm">{b.frameNumber}</span>
                    {b.templateLabel ? (
                      <span className="text-muted-foreground text-xs">
                        {b.templateLabel}
                      </span>
                    ) : null}
                  </span>
                  {/* The colour this bike is painted in — shown on every row,
                      phones included, because it is no longer a batch choice. */}
                  {b.colorName ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      <ColorSwatch hex={b.colorHex} label={b.colorName} />
                      <span className="hidden sm:inline">{b.colorName}</span>
                    </span>
                  ) : (
                    <Badge variant="warning">{t("bikeNoColour")}</Badge>
                  )}
                  <Badge variant={BIKE_STATUS_VARIANT[b.status] ?? "outline"}>
                    {tBikeStatus.has(b.status)
                      ? tBikeStatus(b.status)
                      : b.status}
                  </Badge>
                </label>
              </li>
            );
          })}
        </ul>
      </Panel>

      {isNew || colourlessSelected > 0 ? (
        <Panel
          title={isNew ? t("painterAndColour") : t("colour")}
          description={t("painterColourDesc")}
          contentClassName="flex flex-col gap-3"
        >
          {isNew ? (
            <Field
              label={t("supplier")}
              htmlFor="paint-supplier"
              required
              error={errorField === "supplier_id" ? error : null}
            >
              <Select
                value={supplierId}
                onValueChange={(v) => {
                  setSupplierId(v);
                  clearFieldError("supplier_id");
                }}
              >
                <SelectTrigger id="paint-supplier">
                  <SelectValue placeholder={t("pickSupplierPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {colourlessSelected > 0 ? (
            <Field
              label={t("fallbackColour", { count: colourlessSelected })}
              htmlFor="paint-color"
              required
              error={errorField === "color_id" ? error : null}
            >
              <Select
                value={fallbackColorId}
                onValueChange={(v) => {
                  setFallbackColorId(v);
                  clearFieldError("color_id");
                }}
              >
                <SelectTrigger id="paint-color">
                  <SelectValue placeholder={t("pickColourPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {colors.map((c) => {
                    const label = localizedName(locale, c.name_en, c.name_da);
                    const finish = colorFinishLabel(
                      c.ral_code,
                      c.coating,
                      locale === "da" ? "da" : "en",
                    );
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        <ColorSwatch hex={c.hex} label={label} />
                        {label}
                        {finish ? (
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            {finish}
                          </span>
                        ) : null}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <p className="text-ink-2 text-xs">{t("paintOwnColours")}</p>
          )}
        </Panel>
      ) : null}

      {/* Sits AFTER painter + colour, because it prices against the chosen
          painter's list and colours its lines — and directly above the submit
          button, which is where the truth has to be. */}
      <PaintworkPreview
        selectedBikeIds={selectedBikeIds}
        seedBikes={seedBikes}
        paintworkRows={paintworkRows}
        recipeParts={recipeParts}
        partTypes={partTypes}
        parts={parts}
        priceLists={priceLists}
        fallbackPartTypeIds={isNew ? fallbackPartTypeIds : []}
        supplierId={effectiveSupplierId}
        supplierName={
          targetOrder?.supplierName ??
          suppliers.find((s) => s.id === supplierId)?.name ??
          null
        }
        fallbackColorId={fallbackColorId || null}
        colourById={colourById}
        addingTo={targetOrder?.number ?? null}
      />

      {isNew ? (
        <Panel
          title={t("schedule")}
          description={t("scheduleDesc")}
          contentClassName="flex flex-col gap-3"
        >
          <Field label={t("plannedSendDate")} htmlFor="paint-send-date">
            <Input
              id="paint-send-date"
              type="date"
              value={plannedSendDate}
              onChange={(e) => setPlannedSendDate(e.target.value)}
            />
          </Field>
          <Field label={t("notes")} htmlFor="paint-notes">
            <Textarea
              id="paint-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("paintNotesPlaceholder")}
            />
          </Field>
        </Panel>
      ) : null}

      {error && !errorField ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/sales-orders/${soId}`)}
          disabled={isPending}
        >
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={isPending || selectedCount === 0}>
          {isPending
            ? t("creating")
            : targetOrder
              ? t("addToPaintOrder", {
                  number: targetOrder.number,
                  parts: previewPartCount,
                })
              : t("createPaintOrder", { parts: previewPartCount })}
        </Button>
      </div>
    </form>
  );
}

/**
 * The empty state, saying WHICH empty it is. "No bikes available to send"
 * alone left two people hunting on 15 Sep: in the shop's order of steps paint
 * comes straight after the sale, while the app needs an MO first because that
 * is what creates the bikes.
 */
function NoBikes({
  soId,
  soNumber,
  reason,
  blockingOrders,
  unspawnedLines,
}: {
  soId: string;
  soNumber: string;
  reason: EmptyReason;
  blockingOrders: BlockingOrder[];
  unspawnedLines: number;
}) {
  const t = useTranslations("soDetail");
  return (
    // Page-level notice, so it gets its own Panel: the page background already
    // IS --ground, so a bg-ground fill here would render as floating text.
    <Panel contentClassName="flex flex-col items-center gap-2 py-8 text-center">
      <p className="text-sm font-medium">{t(`noBikes_${reason}_title`)}</p>
      <p className="text-ink-2 max-w-md text-xs">
        {t(`noBikes_${reason}_desc`, { so: soNumber, count: unspawnedLines })}
      </p>
      {reason === "allOnOrder" && blockingOrders.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {blockingOrders.map((o) => (
            <li key={o.id}>
              <Link href={`/paint-orders/${o.id}`} className="font-mono hover:underline">
                {o.number}
              </Link>{" "}
              <span className="text-ink-2 text-xs">
                {t("noBikesOnOrderCount", { count: o.bikes })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <Button asChild variant="outline" className="mt-2">
        <Link href={`/sales-orders/${soId}`}>
          {reason === "noMo" ? t("noBikesSpawnCta") : t("backToSo")}
        </Link>
      </Button>
    </Panel>
  );
}
