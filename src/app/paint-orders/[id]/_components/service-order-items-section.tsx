"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { ColorChip, ColorSwatch } from "@/components/color-swatch";
import { colorFinishLabel } from "@/lib/colors/coating";
import { localizedName } from "@/i18n/vocab";
import type { ColorOption } from "@/app/paint-orders/_components/paint-order-form";

import {
  addServiceOrderItem,
  removeServiceOrderItem,
  updateServiceOrderItem,
} from "../_actions/manage-items";
import { Section } from "./section";

export type PartTypeOption = {
  id: string;
  name_en: string;
  name_da?: string | null;
};

export type ServiceOrderItemRow = {
  id: string;
  partTypeId: string;
  partTypeName: string;
  quantity: number;
  colorId: string | null;
  colorName: string | null;
  colorHex: string | null;
  colorFinish: string | null;
  notes: string | null;
  /** Per-piece + line price, formatted. Estimate while planned (live from
   * the current list), frozen snapshot once sent. Null = unpriced. */
  unitPriceLabel: string | null;
  lineTotalLabel: string | null;
  /** Qty-tier badge, estimate only (e.g. "10–19"). */
  tierBadge: string | null;
  supplierItemNo: string | null;
};

type Props = {
  serviceOrderId: string;
  orderStatus: string;
  rows: ServiceOrderItemRow[];
  partTypes: PartTypeOption[];
  colors: ColorOption[];
  defaultColorId: string | null;
  /** Footer summary, computed server-side. */
  totalLabel: string | null;
  totalIsEstimate: boolean;
  unpricedCount: number;
  priceListName: string | null;
};

export function ServiceOrderItemsSection({
  serviceOrderId,
  orderStatus,
  rows,
  partTypes,
  colors,
  defaultColorId,
  totalLabel,
  totalIsEstimate,
  unpricedCount,
  priceListName,
}: Props) {
  const t = useTranslations("paintOrderDetail");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const canEdit = orderStatus === "planned";

  return (
    <Section
      title={t("itemsTitle")}
      description={canEdit ? t("itemsDescEdit") : t("itemsDescSent")}
      action={
        canEdit ? (
          <AddItemDialog
            serviceOrderId={serviceOrderId}
            partTypes={partTypes}
            colors={colors}
            defaultColorId={defaultColorId}
            onError={setError}
            onChange={() => router.refresh()}
          />
        ) : undefined
      }
    >
      {error ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="text-muted-foreground flex h-20 items-center justify-center rounded-md border border-dashed text-sm">
          {canEdit ? t("noItemsEdit") : t("noItems")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="px-4 py-2 font-medium">{t("part")}</th>
                <th className="px-4 py-2 font-medium">{t("qty")}</th>
                <th className="px-4 py-2 font-medium">{t("colour")}</th>
                <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                  {t("thPerPiece")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("thLine")}
                </th>
                <th className="w-[60px] px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <ItemRow
                  key={r.id}
                  serviceOrderId={serviceOrderId}
                  row={r}
                  colors={colors}
                  canEdit={canEdit}
                  onError={setError}
                  onChange={() => router.refresh()}
                />
              ))}
            </tbody>
          </table>
          <div className="flex flex-col gap-1 border-t px-4 py-2">
            {totalLabel ? (
              <div className="text-muted-foreground flex justify-end gap-2 text-sm">
                <span>
                  {totalIsEstimate
                    ? priceListName
                      ? t("estimatedCostNamed", { name: priceListName })
                      : t("estimatedCost")
                    : t("costFrozen")}
                </span>
                <span className="text-foreground tabular-nums">
                  {totalLabel}
                </span>
              </div>
            ) : null}
            {unpricedCount > 0 ? (
              <p className="text-right text-xs text-amber-600 dark:text-amber-500">
                {t("unpricedWarning", { count: unpricedCount })}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {canEdit && rows.length > 0 && priceListName == null ? (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
          {t("noPriceListWarning")}
        </p>
      ) : null}
    </Section>
  );
}

function ItemRow({
  serviceOrderId,
  row,
  colors,
  canEdit,
  onError,
  onChange,
}: {
  serviceOrderId: string;
  row: ServiceOrderItemRow;
  colors: ColorOption[];
  canEdit: boolean;
  onError: (msg: string | null) => void;
  onChange: () => void;
}) {
  const t = useTranslations("paintOrderDetail");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState(String(row.quantity));

  function commitQty() {
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) {
      setQty(String(row.quantity));
      return;
    }
    if (n === row.quantity) return;
    onError(null);
    start(async () => {
      const r = await updateServiceOrderItem(serviceOrderId, row.id, {
        quantity: n,
      });
      if (!r.ok) {
        onError(r.error);
        setQty(String(row.quantity));
      } else onChange();
    });
  }

  function patchColor(colorId: string) {
    onError(null);
    start(async () => {
      const r = await updateServiceOrderItem(serviceOrderId, row.id, {
        colorId,
      });
      if (!r.ok) onError(r.error);
      else onChange();
    });
  }

  function runRemove() {
    onError(null);
    start(async () => {
      const r = await removeServiceOrderItem(serviceOrderId, row.id);
      if (!r.ok) onError(r.error);
      else onChange();
    });
  }

  return (
    <tr>
      <td className="px-4 py-2.5">
        <span className="flex flex-col gap-0.5">
          <span>{row.partTypeName}</span>
          {row.supplierItemNo ? (
            <span className="text-muted-foreground font-mono text-xs">
              {row.supplierItemNo}
            </span>
          ) : null}
          {row.notes ? (
            <span className="text-muted-foreground text-xs">{row.notes}</span>
          ) : null}
        </span>
      </td>

      <td className="px-4 py-2.5">
        {canEdit ? (
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={pending}
            className="h-8 w-20 tabular-nums"
            aria-label={t("qtyAria", { name: row.partTypeName })}
          />
        ) : (
          <span className="tabular-nums">{row.quantity}</span>
        )}
      </td>

      <td className="px-4 py-2.5">
        {canEdit ? (
          <Select
            value={row.colorId ?? ""}
            onValueChange={patchColor}
            disabled={pending}
          >
            <SelectTrigger size="sm" className="w-[190px]">
              <SelectValue placeholder="—" />
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
        ) : row.colorName ? (
          <span className="flex flex-col gap-0.5">
            <ColorChip hex={row.colorHex} label={row.colorName} />
            {row.colorFinish ? (
              <span className="text-muted-foreground text-xs">
                {row.colorFinish}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      <td className="hidden px-4 py-2.5 text-right sm:table-cell">
        {row.unitPriceLabel ? (
          <span className="inline-flex items-center gap-1.5">
            {row.tierBadge ? (
              <Badge variant="outline" className="font-normal">
                {row.tierBadge}
              </Badge>
            ) : null}
            <span className="tabular-nums">{row.unitPriceLabel}</span>
          </span>
        ) : (
          <span className="text-amber-600 dark:text-amber-500">
            {t("noPrice")}
          </span>
        )}
      </td>

      <td className="px-4 py-2.5 text-right tabular-nums">
        {row.lineTotalLabel ?? (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      <td className="px-4 py-2.5 text-right">
        {canEdit ? (
          <Button
            size="xs"
            variant="outline"
            onClick={runRemove}
            disabled={pending}
            aria-label={t("removeLineAria", { name: row.partTypeName })}
          >
            <Trash2 aria-hidden />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

function AddItemDialog({
  serviceOrderId,
  partTypes,
  colors,
  defaultColorId,
  onError,
  onChange,
}: {
  serviceOrderId: string;
  partTypes: PartTypeOption[];
  colors: ColorOption[];
  defaultColorId: string | null;
  onError: (msg: string | null) => void;
  onChange: () => void;
}) {
  const t = useTranslations("paintOrderDetail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [partTypeId, setPartTypeId] = useState("");
  const [qty, setQty] = useState("1");
  const [colorId, setColorId] = useState(defaultColorId ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function reset() {
    setPartTypeId("");
    setQty("1");
    setColorId(defaultColorId ?? "");
    setNotes("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (next) reset();
    setOpen(next);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!partTypeId) {
      setError(t("errPickPartType"));
      return;
    }
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) {
      setError(t("errQtyWhole"));
      return;
    }
    start(async () => {
      const r = await addServiceOrderItem(serviceOrderId, {
        servicePartTypeId: partTypeId,
        quantity: n,
        colorId: colorId || null,
        notes: notes || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onError(null);
      handleOpenChange(false);
      onChange();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus aria-hidden /> {t("addItem")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("addItemTitle")}</DialogTitle>
            <DialogDescription>{t("addItemDesc")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-part-type">{t("part")}</Label>
              <Select value={partTypeId} onValueChange={setPartTypeId}>
                <SelectTrigger id="item-part-type">
                  <SelectValue placeholder={t("pickPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {partTypes.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>
                      {localizedName(locale, pt.name_en, pt.name_da)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-qty">{t("quantity")}</Label>
              <Input
                id="item-qty"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-color">{t("colour")}</Label>
            <Select value={colorId} onValueChange={setColorId}>
              <SelectTrigger id="item-color">
                <SelectValue placeholder="—" />
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
            <p className="text-muted-foreground text-xs">
              {t("sharedTierHint")}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-notes">{t("notes")}</Label>
            <Textarea
              id="item-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("itemNotesPlaceholder")}
            />
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
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending || partTypeId === ""}>
              {isPending ? t("adding") : t("addItem")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
