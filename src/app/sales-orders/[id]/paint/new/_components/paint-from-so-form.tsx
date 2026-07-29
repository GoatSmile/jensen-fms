"use client";

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

import { createPaintOrderFromSO } from "@/app/sales-orders/_actions/paint-from-so";

export type EligibleSOBike = {
  id: string;
  frameNumber: string;
  templateLabel: string | null;
  colorName: string | null;
  colorHex: string | null;
  status: BikeStatus;
};

type Props = {
  soId: string;
  soNumber: string;
  eligibleBikes: EligibleSOBike[];
  suppliers: SupplierOption[];
  colors: ColorOption[];
  defaultSupplierId: string;
};

export function PaintFromSOForm({
  soId,
  soNumber,
  eligibleBikes,
  suppliers,
  colors,
  defaultSupplierId,
}: Props) {
  const t = useTranslations("soDetail");
  const tCommon = useTranslations("common");
  const tBikeStatus = useTranslations("bikeStatus");
  const locale = useLocale();
  const router = useRouter();
  // Default: every eligible frame selected.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(eligibleBikes.map((b) => b.id)),
  );
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [colorId, setColorId] = useState("");
  const [plannedSendDate, setPlannedSendDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  const selectedCount = useMemo(() => selected.size, [selected]);

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
      setError(t("errPickFrame"));
      return;
    }
    startTransition(async () => {
      const result = await createPaintOrderFromSO({
        soId,
        bikeIds: [...selected],
        supplierId,
        colorId,
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
      // Page-level notice, so it gets its own Panel: the page background already
      // IS --ground, so a bg-ground fill here would render as floating text.
      <Panel contentClassName="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm font-medium">{t("noFramesTitle")}</p>
        <p className="text-ink-2 text-xs">
          {t("noFramesDesc", { so: soNumber })}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => router.push(`/sales-orders/${soId}`)}
        >
          {t("backToSo")}
        </Button>
      </Panel>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Panel
        title={t("framesToPaint")}
        description={t("framesSelected", {
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
                  {b.colorName ? (
                    <span className="hidden sm:inline">
                      <ColorSwatch hex={b.colorHex} label={b.colorName} />
                    </span>
                  ) : null}
                  <Badge variant={BIKE_STATUS_VARIANT[b.status] ?? "outline"}>
                    {tBikeStatus.has(b.status) ? tBikeStatus(b.status) : b.status}
                  </Badge>
                </label>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title={t("painterAndColour")}
        description={t("painterColourDesc")}
        contentClassName="flex flex-col gap-3"
      >
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

          <Field
            label={t("colour")}
            htmlFor="paint-color"
            required
            error={errorField === "color_id" ? error : null}
          >
            <Select
              value={colorId}
              onValueChange={(v) => {
                setColorId(v);
                clearFieldError("color_id");
              }}
            >
              <SelectTrigger id="paint-color">
                <SelectValue placeholder={t("pickColourPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {colors.map((c) => {
                  const label = localizedName(locale, c.name_en, c.name_da);
                  return (
                  <SelectItem key={c.id} value={c.id}>
                    <ColorSwatch hex={c.hex} label={label} />
                    {label}
                    {colorFinishLabel(c.ral_code, c.coating, locale === "da" ? "da" : "en") ? (
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        {colorFinishLabel(c.ral_code, c.coating, locale === "da" ? "da" : "en")}
                      </span>
                    ) : null}
                  </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
      </Panel>

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
            : t("createPaintOrder", { count: selectedCount })}
        </Button>
      </div>
    </form>
  );
}
