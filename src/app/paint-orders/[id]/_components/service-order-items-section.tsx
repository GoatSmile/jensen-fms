"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import type { ColorOption } from "@/app/paint-orders/_components/paint-order-form";

import {
  addServiceOrderItem,
  removeServiceOrderItem,
  updateServiceOrderItem,
} from "../_actions/manage-items";
import { Section } from "./section";

export type PartTypeOption = { id: string; name_en: string };

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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const canEdit = orderStatus === "planned";

  return (
    <Section
      title="Items"
      description={
        canEdit
          ? "What gets painted, and how many. Prices follow the supplier's current list (qty tiers count per part type across the order) and freeze when the order is sent."
          : "Cost basis frozen when the order was sent — a new price list never rewrites it."
      }
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
          {canEdit
            ? "No items yet — add what gets painted. The order can't be sent without items."
            : "No items on this order."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="px-4 py-2 font-medium">Part</th>
                <th className="px-4 py-2 font-medium">Qty</th>
                <th className="px-4 py-2 font-medium">Colour</th>
                <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                  Per piece
                </th>
                <th className="px-4 py-2 text-right font-medium">Line</th>
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
                    ? `Estimated cost${priceListName ? ` (${priceListName})` : ""}:`
                    : "Cost (frozen at send):"}
                </span>
                <span className="text-foreground tabular-nums">
                  {totalLabel}
                </span>
              </div>
            ) : null}
            {unpricedCount > 0 ? (
              <p className="text-right text-xs text-amber-600 dark:text-amber-500">
                {unpricedCount}{" "}
                {unpricedCount === 1 ? "line has" : "lines have"} no price on
                the current list — sending is blocked until priced.
              </p>
            ) : null}
          </div>
        </div>
      )}

      {canEdit && rows.length > 0 && priceListName == null ? (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
          This supplier has no current price list for this service — items
          can&apos;t be priced or sent.
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
            aria-label={`Quantity of ${row.partTypeName}`}
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
              {colors.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <ColorSwatch hex={c.hex} label={c.name_en} />
                  {c.name_en}
                  {colorFinishLabel(c.ral_code, c.coating) ? (
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      {colorFinishLabel(c.ral_code, c.coating)}
                    </span>
                  ) : null}
                </SelectItem>
              ))}
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
          <span className="text-amber-600 dark:text-amber-500">no price</span>
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
            aria-label={`Remove ${row.partTypeName} line`}
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
      setError("Pick a part type.");
      return;
    }
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) {
      setError("Quantity must be a whole number above zero.");
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
          <Plus aria-hidden /> Add item
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add item line</DialogTitle>
            <DialogDescription>
              A part type × quantity (× colour). The price resolves from the
              supplier&apos;s current list — qty tiers count the part
              type&apos;s total across the whole order.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-part-type">Part</Label>
              <Select value={partTypeId} onValueChange={setPartTypeId}>
                <SelectTrigger id="item-part-type">
                  <SelectValue placeholder="Pick…" />
                </SelectTrigger>
                <SelectContent>
                  {partTypes.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>
                      {pt.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-qty">Quantity</Label>
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
            <Label htmlFor="item-color">Colour</Label>
            <Select value={colorId} onValueChange={setColorId}>
              <SelectTrigger id="item-color">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {colors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <ColorSwatch hex={c.hex} label={c.name_en} />
                    {c.name_en}
                    {colorFinishLabel(c.ral_code, c.coating) ? (
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        {colorFinishLabel(c.ral_code, c.coating)}
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Two lines of the same part in different colours share one qty
              tier.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-notes">Notes</Label>
            <Textarea
              id="item-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — anything specific to these pieces."
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
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || partTypeId === ""}>
              {isPending ? "Adding…" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
