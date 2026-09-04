"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

import { ColorSwatch } from "@/components/color-swatch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appendField } from "@/lib/forms";
import { formatPrice } from "@/lib/format";
import { colorFinishLabel } from "@/lib/colors/coating";
import { localizedName } from "@/i18n/vocab";
import { familyTint } from "@/lib/bike-templates/family-colors";
import {
  computeLineMoney,
  round2,
  type ColorChoice,
  type CommercialLineResult,
  type LineDialogInitial,
  type PartChoice,
  type TemplateChoice,
  type VatCodeChoice,
} from "@/lib/commercial/lines";

/**
 * Add / edit one line on a commercial document (offer or sales order).
 *
 * The document is not named here: the caller passes `onSubmit`, which closes
 * over its own server action. That is what lets one dialog serve both without
 * a `docKind` switch — and it means a new document type adds no branch here.
 */

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** null = add mode; a value = edit that line. */
  initial: LineDialogInitial | null;
  defaultVatCode: string | null;
  currency: string;
  onSubmit: (fd: FormData) => Promise<CommercialLineResult>;
  parts: PartChoice[];
  templates: TemplateChoice[];
  vatCodes: VatCodeChoice[];
  colors: ColorChoice[];
};

const NO_VAT = "__none__";
const NO_COLOR = "__none__";

export function LineDialog({
  open,
  onOpenChange,
  initial,
  defaultVatCode,
  currency,
  onSubmit,
  parts,
  templates,
  vatCodes,
  colors,
}: Props) {
  const t = useTranslations("commercialLines");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [kind, setKind] = useState<"part" | "template">(
    initial?.kind ?? "template",
  );
  const [partId, setPartId] = useState(initial?.partId ?? "");
  const [templateId, setTemplateId] = useState(initial?.bikeTemplateId ?? "");
  const [colorId, setColorId] = useState(initial?.colorId ?? "");
  const [filter, setFilter] = useState("");
  const [quantity, setQuantity] = useState(
    initial != null ? String(initial.quantity) : "1",
  );
  const [unitPrice, setUnitPrice] = useState(
    initial != null ? String(initial.unitPrice) : "",
  );
  const [vatCode, setVatCode] = useState<string>(
    initial?.vatCode ?? defaultVatCode ?? "",
  );
  const [descEn, setDescEn] = useState(initial?.descriptionEn ?? "");
  const [descDa, setDescDa] = useState(initial?.descriptionDa ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const partLocked = initial != null;

  const filteredParts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) =>
      `${p.internal_sku} ${p.name_en}`.toLowerCase().includes(q),
    );
  }, [parts, filter]);

  const filteredTemplates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) =>
      `${t.name_en} ${t.family ?? ""} ${t.frame_size ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [templates, filter]);

  const selectedVat = vatCodes.find((v) => v.code === vatCode) ?? null;

  const preview = useMemo(() => {
    const q = Number(quantity.replace(",", "."));
    const u = Number(unitPrice.replace(",", "."));
    const rate = Number(selectedVat?.default_rate ?? 0);
    if (!Number.isFinite(q) || !Number.isFinite(u) || q <= 0 || u < 0) {
      return null;
    }
    // Same function the server writes with, so the preview cannot drift from
    // what gets stored.
    const money = computeLineMoney(q, u, rate);
    return {
      subtotal: round2(money.subtotal),
      vat: round2(money.vat),
      total: round2(money.total),
    };
  }, [quantity, unitPrice, selectedVat]);

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("kind", kind);
    if (kind === "part") {
      appendField(fd, "part_id", partId);
    } else {
      appendField(fd, "bike_template_id", templateId);
    }
    appendField(fd, "quantity", quantity.replace(",", "."));
    appendField(fd, "unit_price", unitPrice.replace(",", "."));
    appendField(fd, "vat_code", vatCode);
    appendField(fd, "color_id", colorId);
    appendField(fd, "description_en", descEn);
    appendField(fd, "description_da", descDa);
    return fd;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (kind === "part" && !partId) {
      setError(t("errPickPart"));
      return;
    }
    if (kind === "template" && !templateId) {
      setError(t("errPickTemplate"));
      return;
    }

    start(async () => {
      const r = await onSubmit(buildFormData());
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const title = initial == null ? t("addLine") : t("editLineTitle");
  const submitLabel = initial == null ? t("addLine") : t("saveChanges");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t("lineDialogDesc")}</DialogDescription>
          </DialogHeader>

          {/* Kind toggle — locked in edit mode (changes are subtle, and on a
              sales order the spawn-MO action depends on this). */}
          {!partLocked ? (
            <div className="flex flex-col gap-1.5">
              <Label>{t("lineType")}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={kind === "template" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setKind("template")}
                >
                  {t("bikeTemplate")}
                </Button>
                <Button
                  type="button"
                  variant={kind === "part" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setKind("part")}
                >
                  {t("partAccessory")}
                </Button>
              </div>
            </div>
          ) : null}

          {/* Picker */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="line-filter">
              {kind === "template" ? t("bikeTemplate") : t("part")}
            </Label>
            {partLocked ? (
              <div className="bg-ground rounded-lg px-3 py-2 text-sm italic">
                {t("lockedEditMode")}
              </div>
            ) : (
              <>
                <Input
                  id="line-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t("filterPlaceholder")}
                />
                <div className="bg-ground max-h-56 overflow-y-auto rounded-lg">
                  {kind === "template" ? (
                    filteredTemplates.length === 0 ? (
                      <p className="text-muted-foreground p-3 text-center text-sm">
                        {t("noTemplatesMatch")}
                      </p>
                    ) : (
                      <ul className="divide-y">
                        {filteredTemplates.map((tpl) => {
                          const isPicked = templateId === tpl.id;
                          return (
                            <li key={tpl.id}>
                              <button
                                type="button"
                                onClick={() => setTemplateId(tpl.id)}
                                className={`hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                                  isPicked ? "bg-muted" : ""
                                }`}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {tpl.name_en}
                                  </span>
                                  {tpl.family || tpl.frame_size ? (
                                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                                      {tpl.family ? (
                                        <span
                                          className={`size-1.5 shrink-0 rounded-full ${familyTint(tpl.family_id).dot}`}
                                          aria-hidden
                                        />
                                      ) : null}
                                      {[tpl.family, tpl.frame_size]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                  ) : null}
                                </div>
                                {isPicked ? (
                                  <span className="text-good text-xs">
                                    {t("selected")}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )
                  ) : filteredParts.length === 0 ? (
                    <p className="text-muted-foreground p-3 text-center text-sm">
                      {t("noPartsMatch")}
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {filteredParts.map((p) => {
                        const isPicked = partId === p.id;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => setPartId(p.id)}
                              className={`hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                                isPicked ? "bg-muted" : ""
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{p.name_en}</span>
                                <span className="text-muted-foreground font-mono text-xs">
                                  {p.internal_sku}
                                </span>
                              </div>
                              {isPicked ? (
                                <span className="text-good text-xs">
                                  {t("selected")}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-qty">{t("quantity")}</Label>
              <Input
                id="line-qty"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-price">
                {t("unitPriceCurrency", { currency })}
              </Label>
              <Input
                id="line-price"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-vat">{t("vatCode")}</Label>
              <Select
                value={vatCode === "" ? NO_VAT : vatCode}
                onValueChange={(v) => setVatCode(v === NO_VAT ? "" : v)}
              >
                <SelectTrigger id="line-vat">
                  <SelectValue placeholder={t("customerDefault")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VAT}>{t("noVatCode")}</SelectItem>
                  {vatCodes.map((v) => (
                    <SelectItem key={v.code} value={v.code}>
                      <span className="font-mono text-xs">{v.code}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {localizedName(locale, v.name_en, v.name_da)} (
                        {v.default_rate}%)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {kind === "template" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-color">{t("colourOptional")}</Label>
              <Select
                value={colorId === "" ? NO_COLOR : colorId}
                onValueChange={(v) => setColorId(v === NO_COLOR ? "" : v)}
              >
                <SelectTrigger id="line-color">
                  <SelectValue placeholder={t("colourNotPicked")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COLOR}>
                    <span className="text-muted-foreground italic">
                      {t("noColour")}
                    </span>
                  </SelectItem>
                  {colors.map((c) => {
                    const finish = colorFinishLabel(
                      c.ral_code,
                      c.coating,
                      locale === "da" ? "da" : "en",
                    );
                    const label = localizedName(locale, c.name_en, c.name_da);
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        <ColorSwatch
                          hex={c.hex}
                          ralCode={c.ral_code}
                          label={label}
                          className="mr-2"
                        />
                        {label}
                        {finish ? (
                          <span className="text-muted-foreground ml-2 text-xs">
                            {finish}
                          </span>
                        ) : null}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-desc-en">{t("descEnLabel")}</Label>
              <Textarea
                id="line-desc-en"
                rows={2}
                value={descEn}
                onChange={(e) => setDescEn(e.target.value)}
                placeholder={t("descEnPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-desc-da">{t("descDaLabel")}</Label>
              <Textarea
                id="line-desc-da"
                rows={2}
                value={descDa}
                onChange={(e) => setDescDa(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-ground flex flex-col gap-1.5 rounded-lg px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("subtotal")}</span>
              <span className="tabular-nums">
                {formatPrice(preview?.subtotal ?? null, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("vat")}{" "}
                {selectedVat ? (
                  <span className="font-mono">
                    ({selectedVat.default_rate}%)
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums">
                {formatPrice(preview?.vat ?? null, currency)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="text-muted-foreground">{t("lineTotal")}</span>
              <span className="font-semibold tabular-nums">
                {formatPrice(preview?.total ?? null, currency)}
              </span>
            </div>
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? tCommon("saving") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
