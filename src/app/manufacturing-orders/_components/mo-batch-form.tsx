"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Minus, Plus, Search, Trash2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ColorSwatch } from "@/components/color-swatch";
import { Field } from "@/components/field";
import { DeliveryWeekDateField } from "@/components/delivery-week-date-field";
import { appendField } from "@/lib/forms";
import { familyTint } from "@/lib/bike-templates/family-colors";
import { localizedName } from "@/i18n/vocab";

import { formatDkk, formatQuantity } from "@/lib/parts/stock";

import {
  createManufacturingOrdersBatch,
  type BatchRowInput,
} from "../_actions/save-mo-batch";
import type { ColorOption, TemplateOption } from "./mo-form";

const QTY_PRESETS = [10, 20, 50, 100];
const DEFAULT_QTY = 10;

type BatchRow = {
  /** Client-side row identity (template can repeat across rows). */
  key: number;
  templateId: string;
  colorId: string;
  qty: string;
};

export type BomLine = { partId: string; qty: number };

export type PartPreviewInfo = {
  sku: string;
  name: string;
  onHand: number;
  /** Last landed cost in DKK; null when never purchased. */
  lastCost: number | null;
};

type Props = {
  templates: TemplateOption[];
  colors: ColorOption[];
  /** Pre-seed one row for this template (deep link from a template page). */
  initialTemplateId?: string;
  /** templateId → BOM lines, for the live coverage preview. */
  boms: Record<string, BomLine[]>;
  /** partId → sku/name/stock/cost, for the live coverage preview. */
  partsInfo: Record<string, PartPreviewInfo>;
};

/**
 * Bulk-first MO creation: click template cards to add batch rows
 * (template × colour × quantity), then create every MO — and optionally
 * all their bikes — in one submit. 2+ rows become sibling MOs whose notes
 * cross-reference each other ("Batch siblings: MO-…").
 */
export function MOBatchForm({
  templates,
  colors,
  initialTemplateId,
  boms,
  partsInfo,
}: Props) {
  const t = useTranslations("mo");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<BatchRow[]>(() =>
    initialTemplateId && templates.some((t) => t.id === initialTemplateId)
      ? [
          {
            key: 0,
            templateId: initialTemplateId,
            colorId: "",
            qty: String(DEFAULT_QTY),
          },
        ]
      : [],
  );
  // Ref, not state: two add-clicks in one React batch would both read a
  // stale state counter and mint duplicate keys (updateRow then hits both).
  const nextKeyRef = useRef(1);
  const [search, setSearch] = useState("");
  const [createBikes, setCreateBikes] = useState(true);
  const [showShortfall, setShowShortfall] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endPrecision, setEndPrecision] = useState<"exact" | "week">("exact");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorRow, setErrorRow] = useState<number | null>(null);
  const [isPending, start] = useTransition();

  const templateById = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates],
  );

  // Family groups for the card grid. Templates without a family group under
  // their own name so every template gets a card. The templates prop arrives
  // pre-sorted family-first (admin sort_order, then name), so insertion
  // order IS the display order — no alphabetical re-sort here.
  const families = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? templates.filter((t) =>
          [t.family ?? "", t.name_en, t.frame_size, t.bike_type_name ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : templates;
    const m = new Map<
      string,
      { label: string; familyId: string | null; members: TemplateOption[] }
    >();
    for (const t of filtered) {
      const key = t.family_id ?? `name:${t.name_en}`;
      const entry = m.get(key) ?? {
        label: t.family ?? t.name_en,
        familyId: t.family_id,
        members: [],
      };
      entry.members.push(t);
      m.set(key, entry);
    }
    return [...m.entries()];
  }, [templates, search]);

  const rowCountByTemplate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      m.set(r.templateId, (m.get(r.templateId) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const totalBikes = rows.reduce((s, r) => {
    const n = Number(r.qty);
    return s + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  }, 0);

  // Live coverage: aggregate part demand across every row, compare against
  // on-hand stock, and price the whole batch at last landed cost.
  const coverage = useMemo(() => {
    const demand = new Map<string, number>();
    for (const r of rows) {
      const n = Number(r.qty);
      const qty = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      if (qty === 0) continue;
      for (const line of boms[r.templateId] ?? []) {
        demand.set(line.partId, (demand.get(line.partId) ?? 0) + line.qty * qty);
      }
    }
    const shortfall: {
      partId: string;
      sku: string;
      name: string;
      need: number;
      have: number;
    }[] = [];
    let coveredCount = 0;
    let estimatedCost = 0;
    let unpriced = 0;
    for (const [partId, need] of demand) {
      const info = partsInfo[partId];
      const have = info?.onHand ?? 0;
      if (need > have) {
        shortfall.push({
          partId,
          sku: info?.sku ?? "—",
          name: info?.name ?? "—",
          need,
          have,
        });
      } else {
        coveredCount += 1;
      }
      if (info?.lastCost != null && info.lastCost > 0) {
        estimatedCost += need * info.lastCost;
      } else {
        unpriced += 1;
      }
    }
    shortfall.sort((a, b) => b.need - b.have - (a.need - a.have));
    return {
      totalParts: demand.size,
      coveredCount,
      shortfall,
      estimatedCost,
      unpriced,
    };
  }, [rows, boms, partsInfo]);

  function addRow(templateId: string) {
    const key = nextKeyRef.current++;
    setRows((prev) => [
      ...prev,
      { key, templateId, colorId: "", qty: String(DEFAULT_QTY) },
    ]);
    setError(null);
    setErrorRow(null);
  }

  function updateRow(key: number, patch: Partial<BatchRow>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
    setError(null);
    setErrorRow(null);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setError(null);
    setErrorRow(null);
  }

  function stepQty(row: BatchRow, delta: number) {
    const n = Number(row.qty);
    const current = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    updateRow(row.key, { qty: String(Math.max(1, current + delta)) });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorRow(null);

    if (rows.length === 0) {
      setError(t("errNoRows"));
      return;
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const n = Number(r.qty);
      if (!r.colorId) {
        setError(t("errNoColour"));
        setErrorRow(i);
        return;
      }
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        setError(t("errQty"));
        setErrorRow(i);
        return;
      }
    }

    const payload: BatchRowInput[] = rows.map((r) => ({
      bike_template_id: r.templateId,
      color_id: r.colorId,
      quantity: Number(r.qty),
    }));

    start(async () => {
      const fd = new FormData();
      appendField(fd, "rows", JSON.stringify(payload));
      appendField(fd, "planned_start_date", startDate);
      appendField(fd, "planned_completion_date", endDate);
      appendField(fd, "planned_completion_precision", endPrecision);
      appendField(fd, "notes", notes);
      appendField(fd, "create_bikes", createBikes ? "true" : "false");
      const result = await createManufacturingOrdersBatch(fd);
      // Success redirects server-side; reaching here means failure.
      if (result && !result.ok) {
        const created = result.createdMoNumbers?.length
          ? t("alreadyCreatedKept", {
              list: result.createdMoNumbers.join(", "),
            })
          : "";
        setError(`${result.error}${created}`);
        setErrorRow(result.rowIndex ?? null);
        if (result.createdMoNumbers?.length) router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* 1 — template cards. Click to add a batch row. */}
      <section className="rounded-md border">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">{t("buildingWhatTitle")}</h2>
            <p className="text-muted-foreground text-xs">
              {t("buildingWhatDesc")}
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <Search
              className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchTemplates")}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </header>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {families.length === 0 ? (
            <p className="text-muted-foreground col-span-full p-2 text-center text-sm italic">
              {templates.length === 0
                ? t.rich("noCurrentTemplatesCard", {
                    link: (chunks) => (
                      <Link href="/bike-templates" className="underline">
                        {chunks}
                      </Link>
                    ),
                  })
                : t("noTemplatesMatch")}
            </p>
          ) : (
            families.map(([key, { label, familyId, members }]) => (
              <div
                key={key}
                className="overflow-hidden rounded-md border"
              >
                <div
                  className={`flex items-baseline justify-between gap-2 border-b px-3 py-2 ${familyTint(familyId).header}`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <span
                      className={`size-2 shrink-0 rounded-full ${familyTint(familyId).dot}`}
                      aria-hidden
                    />
                    {label}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {members[0].bike_type_name ?? ""}
                  </span>
                </div>
                <div className="p-3">
                  <div className="flex flex-wrap gap-1.5">
                  {members.map((t) => {
                    const inBatch = rowCountByTemplate.get(t.id) ?? 0;
                    // A family can hold varied models, not just sizes
                    // ("Norma FS" and "Norma CS" are both 48cm) — once
                    // names differ within the group, size alone is
                    // ambiguous, so the chip carries the name too.
                    const showName =
                      t.family == null ||
                      new Set(members.map((m) => m.name_en)).size > 1;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => addRow(t.id)}
                        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          inBatch > 0
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "hover:bg-muted/60"
                        }`}
                        title={`${t.name_en} · v${t.version}`}
                      >
                        <Plus className="size-3" aria-hidden />
                        {t.frame_size}
                        {showName ? (
                          <span className="text-muted-foreground font-normal">
                            {t.name_en}
                          </span>
                        ) : null}
                        {inBatch > 0 ? (
                          <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] tabular-nums">
                            {inBatch}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <footer className="text-muted-foreground border-t px-4 py-2 text-xs">
          {t.rich("oneOffFooter", {
            link: (chunks) => (
              <Link
                href="/manufacturing-orders/new?mode=oneoff"
                className="hover:text-foreground underline underline-offset-4"
              >
                {chunks}
              </Link>
            ),
          })}
        </footer>
      </section>

      {/* 2 — the batch rows */}
      <section className="rounded-md border">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">{t("batchTitle")}</h2>
            <p className="text-muted-foreground text-xs">{t("batchDescRow")}</p>
          </div>
          {rows.length > 0 ? (
            <span className="text-sm tabular-nums">
              {t.rich("batchSummary", {
                count: rows.length,
                bikes: totalBikes,
                b: (chunks) => (
                  <span className="font-semibold">{chunks}</span>
                ),
              })}
            </span>
          ) : null}
        </header>
        {rows.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm italic">
            {t("batchEmpty")}
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row, i) => {
              const tpl = templateById.get(row.templateId);
              const label = tpl
                ? [tpl.family, tpl.frame_size, tpl.name_en]
                    .filter(Boolean)
                    .join(" · ")
                : "—";
              const isErrorRow = errorRow === i;
              return (
                <li
                  key={row.key}
                  className={`flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:justify-between ${
                    isErrorRow ? "bg-destructive/5" : ""
                  }`}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-muted-foreground text-xs">
                      v{tpl?.version}
                      {tpl?.bike_type_name ? ` · ${tpl.bike_type_name}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={row.colorId}
                      onValueChange={(v) => updateRow(row.key, { colorId: v })}
                    >
                      <SelectTrigger
                        className="h-9 w-[150px]"
                        aria-label={t("colourForLabel", { label })}
                      >
                        <SelectValue placeholder={t("colourShort")} />
                      </SelectTrigger>
                      <SelectContent>
                        {colors.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <ColorSwatch
                              hex={c.hex}
                              label={localizedName(locale, c.name_en, c.name_da)}
                            />
                            {localizedName(locale, c.name_en, c.name_da)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label={t("fewerBikesFor", { label })}
                        onClick={() => stepQty(row, -1)}
                        disabled={Number(row.qty) <= 1}
                      >
                        <Minus className="size-3.5" aria-hidden />
                      </Button>
                      <Input
                        inputMode="numeric"
                        value={row.qty}
                        onChange={(e) =>
                          updateRow(row.key, { qty: e.target.value })
                        }
                        className="h-9 w-14 text-center tabular-nums"
                        aria-label={t("quantityFor", { label })}
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label={t("moreBikesFor", { label })}
                        onClick={() => stepQty(row, 1)}
                      >
                        <Plus className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      {QTY_PRESETS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => updateRow(row.key, { qty: String(n) })}
                          className={`rounded border px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${
                            Number(row.qty) === n
                              ? "border-primary/40 bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-muted/60"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("removeFromBatch", { label })}
                      onClick={() => removeRow(row.key)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {rows.length > 0 && totalBikes > 0 && coverage.totalParts > 0 ? (
          <footer className="bg-muted/20 border-t px-4 py-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {t("partsCoverage")}
                </span>
                {coverage.shortfall.length === 0 ? (
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {t("allPartsInStock", { count: coverage.totalParts })}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowShortfall((v) => !v)}
                    className="text-destructive font-medium underline-offset-4 hover:underline"
                  >
                    {t("partsShort", { count: coverage.shortfall.length })} —{" "}
                    {showShortfall ? t("hide") : t("show")}
                  </button>
                )}
              </div>
              <span className="text-muted-foreground tabular-nums">
                {t("estPartsCost")}
                <span className="text-foreground font-medium">
                  {coverage.estimatedCost > 0
                    ? formatDkk(coverage.estimatedCost)
                    : "—"}
                </span>
                {coverage.unpriced > 0 ? (
                  <span>{t("unpricedSuffix", { count: coverage.unpriced })}</span>
                ) : null}
              </span>
            </div>
            {showShortfall && coverage.shortfall.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 border-t pt-2">
                {coverage.shortfall.map((s) => (
                  <li
                    key={s.partId}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">
                      {s.name}{" "}
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {s.sku}
                      </span>
                    </span>
                    <span className="text-destructive shrink-0 tabular-nums">
                      {t("needHave", {
                        need: formatQuantity(s.need),
                        have: formatQuantity(s.have),
                      })}
                    </span>
                  </li>
                ))}
                <li className="text-muted-foreground mt-1">
                  {t("shortfallHint")}
                </li>
              </ul>
            ) : null}
          </footer>
        ) : null}
      </section>

      {/* 3 — shared production plan */}
      <section className="rounded-md border">
        <header className="flex flex-col gap-0.5 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            {t("productionPlanTitle")}
          </h2>
          <p className="text-muted-foreground text-xs">
            {t("productionPlanDescBatch")}
          </p>
        </header>
        <div className="flex flex-col gap-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("plannedStartDate")} htmlFor="batch-start">
              <Input
                id="batch-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label={t("expectedCompletion")} htmlFor="batch-end">
              <DeliveryWeekDateField
                id="batch-end"
                date={endDate}
                precision={endPrecision}
                onChange={(date, precision) => {
                  setEndDate(date);
                  setEndPrecision(precision);
                }}
              />
            </Field>
          </div>
          <Field label={t("notes")} htmlFor="batch-notes">
            <Textarea
              id="batch-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholderBatch")}
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border p-3">
            <input
              type="checkbox"
              checked={createBikes}
              onChange={(e) => setCreateBikes(e.target.checked)}
              className="accent-primary mt-0.5 size-4"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">
                {t("createBikesNow")}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("createBikesHint")}
              </span>
            </span>
          </label>
        </div>
      </section>

      {error ? (
        <p
          className="bg-destructive/10 text-destructive border-destructive/30 rounded-md border p-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/manufacturing-orders")}
          disabled={isPending}
        >
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={isPending || rows.length === 0}>
          <Wrench className="size-4" aria-hidden />
          {isPending
            ? t("creating")
            : rows.length === 0
              ? t("createMoBatch")
              : t("createNMos", { count: rows.length }) +
                (createBikes && totalBikes > 0
                  ? t("plusNBikes", { count: totalBikes })
                  : "")}
        </Button>
      </div>
    </form>
  );
}
