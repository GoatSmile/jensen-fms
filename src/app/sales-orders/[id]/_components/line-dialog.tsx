"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
import { familyTint } from "@/lib/bike-templates/family-colors";

import { addSOLine, updateSOLine } from "../../_actions/manage-so-lines";

export type PartChoice = {
  id: string;
  internal_sku: string;
  name_en: string;
};
export type TemplateChoice = {
  id: string;
  name_en: string;
  family: string | null;
  /** FK to bike_families — drives the family's app-wide tint dot. */
  family_id: string | null;
  /** Admin-set family sort_order (page-side family-adjacent ordering). */
  family_sort: number | null;
  frame_size: string | null;
};
export type VatCodeChoice = {
  code: string;
  name_en: string;
  default_rate: number;
};
export type ColorChoice = {
  id: string;
  name_en: string;
  hex: string | null;
  ral_code: string | null;
  coating: string | null;
};

export type LineDialogInitial = {
  lineId: string;
  kind: "part" | "template";
  partId: string | null;
  bikeTemplateId: string | null;
  quantity: number;
  unitPrice: number;
  vatCode: string | null;
  colorId: string | null;
  descriptionEn: string | null;
  descriptionDa: string | null;
};

type Mode =
  | { kind: "add"; soId: string; defaultVatCode: string | null; soCurrency: string }
  | {
      kind: "edit";
      initial: LineDialogInitial;
      defaultVatCode: string | null;
      soCurrency: string;
    };

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
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
  mode,
  parts,
  templates,
  vatCodes,
  colors,
}: Props) {
  const t = useTranslations("soDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const initial = mode.kind === "edit" ? mode.initial : null;
  const defaultVatCode =
    mode.kind === "add" ? mode.defaultVatCode : mode.defaultVatCode;
  const soCurrency = mode.kind === "add" ? mode.soCurrency : mode.soCurrency;

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

  const partLocked = mode.kind === "edit";

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
    const subtotal = q * u;
    const vat = subtotal * (rate / 100);
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      total: Math.round((subtotal + vat) * 100) / 100,
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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      const fd = buildFormData();
      const r =
        mode.kind === "add"
          ? await addSOLine(mode.soId, fd)
          : await updateSOLine(mode.initial.lineId, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const title = mode.kind === "add" ? t("addLine") : t("editLineTitle");
  const submitLabel = mode.kind === "add" ? t("addLine") : t("saveChanges");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t("lineDialogDesc")}</DialogDescription>
          </DialogHeader>

          {/* Kind toggle — locked in edit mode (changes are subtle and the
              spawn-MO action depends on this). */}
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
              <div className="bg-muted/40 rounded-md border px-3 py-2 text-sm italic">
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
                <div className="max-h-56 overflow-y-auto rounded-md border">
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
                                  <span className="text-xs text-emerald-700 dark:text-emerald-400">
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
                                <span className="text-xs text-emerald-700 dark:text-emerald-400">
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
                {t("unitPriceCurrency", { currency: soCurrency })}
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
                onValueChange={(v) =>
                  setVatCode(v === NO_VAT ? "" : v)
                }
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
                        {v.name_en} ({v.default_rate}%)
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
                onValueChange={(v) =>
                  setColorId(v === NO_COLOR ? "" : v)
                }
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
                    const finish = colorFinishLabel(c.ral_code, c.coating);
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        <ColorSwatch
                          hex={c.hex}
                          ralCode={c.ral_code}
                          label={c.name_en}
                          className="mr-2"
                        />
                        {c.name_en}
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

          <div className="bg-muted/30 flex flex-col gap-1.5 rounded-md border px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("subtotal")}</span>
              <span className="tabular-nums">
                {formatPrice(preview?.subtotal ?? null, soCurrency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("vat")}{" "}
                {selectedVat ? (
                  <span className="font-mono">({selectedVat.default_rate}%)</span>
                ) : null}
              </span>
              <span className="tabular-nums">
                {formatPrice(preview?.vat ?? null, soCurrency)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="text-muted-foreground">{t("lineTotal")}</span>
              <span className="font-semibold tabular-nums">
                {formatPrice(preview?.total ?? null, soCurrency)}
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
