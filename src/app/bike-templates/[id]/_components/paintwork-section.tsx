"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  PaintListUnavailable,
  TemplatePaintLadderRung,
  TemplatePaintworkRow,
} from "@/lib/services/template-paint";

import {
  addTemplatePaintPart,
  removeTemplatePaintPart,
  updateTemplatePaintPart,
} from "../_actions/manage-service-parts";

export type PaintPartTypeOption = { id: string; name_en: string };

type Props = {
  templateId: string;
  isCurrent: boolean;
  rows: TemplatePaintworkRow[];
  partTypes: PaintPartTypeOption[];
  /** Footer summary, computed server-side. Always the singles tier. */
  totalLabel: string | null;
  /** Per-bike price at each batch size that changes it; empty when flat. */
  ladder: TemplatePaintLadderRung[];
  listLabel: string | null;
  unpricedCount: number;
  /** Why no list priced this, when none did. */
  unavailable: PaintListUnavailable | null;
  /**
   * Painter part types the template's RECIPE can satisfy — a recipe part
   * marked *Paintable as* that type. A declared row outside this set is priced
   * into margin but invisible to the MO's coverage and the build floor.
   */
  backedPartTypeIds: string[];
};

/**
 * The template's paintwork declaration: which part-units one bike of this
 * template sends to the painter, priced live against the default painter's
 * current list.
 *
 * The footer figure is the SINGLES tier and says so — it is the number that
 * joins parts cost in the cost-to-produce box, and a template that assumed a
 * batch would inflate every margin built on it. The ladder beside it shows
 * what a batch actually buys, as information rather than arithmetic.
 */
export function PaintworkSection({
  templateId,
  isCurrent,
  rows,
  partTypes,
  totalLabel,
  ladder,
  listLabel,
  unpricedCount,
  unavailable,
  backedPartTypeIds,
}: Props) {
  const t = useTranslations("templateDetail");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const canEdit = isCurrent;

  const backed = new Set(backedPartTypeIds);
  const unbacked = rows.filter((r) => !backed.has(r.partTypeId));

  const declaredIds = new Set(rows.map((r) => r.partTypeId));
  const addablePartTypes = partTypes.filter((pt) => !declaredIds.has(pt.id));

  return (
    <Panel
      title={t("paintworkTitle")}
      description={t("paintworkDescription")}
      action={
        canEdit ? (
          <AddPaintworkRow
            templateId={templateId}
            partTypes={addablePartTypes}
            onError={setError}
            onChange={() => router.refresh()}
          />
        ) : null
      }
    >
      <div>
        {error ? (
          <p className="text-destructive mb-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <div className="text-ink-3 bg-ground flex h-16 items-center justify-center rounded-md text-sm">
            {canEdit ? t("paintworkEmptyEdit") : t("paintworkEmptyReadOnly")}
          </div>
        ) : (
          <div className="overflow-x-auto md:overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="px-4 py-2 font-medium">{t("thPart")}</th>
                  <th className="px-4 py-2 font-medium">{t("thQtyPerBike")}</th>
                  <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                    {t("thPerPiece")}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t("thLine")}
                  </th>
                  {canEdit ? <th className="w-[60px] px-4 py-2" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <PaintworkRow
                    key={r.id}
                    templateId={templateId}
                    row={r}
                    backedByRecipe={backed.has(r.partTypeId)}
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
                    {listLabel
                      ? t("paintPerBikeSinglesWithList", { list: listLabel })
                      : t("paintPerBikeSingles")}
                  </span>
                  <span className="text-foreground font-medium tabular-nums">
                    {totalLabel}
                  </span>
                </div>
              ) : null}
              {ladder.length > 1 ? (
                <p className="text-muted-foreground text-right text-xs">
                  {t("paintLadderPrefix")}{" "}
                  {ladder
                    .map((rung) =>
                      t("paintLadderRung", {
                        range:
                          rung.toBikes == null
                            ? `${rung.fromBikes}+`
                            : rung.fromBikes === rung.toBikes
                              ? `${rung.fromBikes}`
                              : `${rung.fromBikes}–${rung.toBikes}`,
                        price: rung.perBikeLabel,
                      }),
                    )
                    .join(" · ")}
                </p>
              ) : null}
              {unpricedCount > 0 ? (
                <p className="text-right text-xs text-money">
                  {t("unpricedLines", { count: unpricedCount })}
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/* Why there is no cost, specifically. The estimate no longer falls back
            to another supplier's list, so this line is the whole explanation of
            a blank paint cost — and each reason has a different fix. */}
        {rows.length > 0 && listLabel == null ? (
          <p className="text-money mt-2 text-xs">
            {unavailable?.reason === "no_default_supplier"
              ? t("noDefaultSupplier")
              : unavailable?.reason === "default_has_no_list"
                ? t("defaultHasNoList", {
                    supplier: unavailable.supplierName ?? t("thatSupplier"),
                  })
                : t("noPriceList")}
          </p>
        ) : null}

        {/* The declaration and the shop floor read from two different places:
            this table prices what goes to the painter, while "needs paint" on
            the MO and in the build queue comes from recipe parts marked
            *Paintable as*. Say so where it can be fixed. */}
        {unbacked.length > 0 ? (
          <p className="text-money mt-2 text-xs">
            {t("paintworkUnbackedNote", {
              types: unbacked.map((r) => r.partTypeName).join(", "),
            })}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function PaintworkRow({
  templateId,
  row,
  backedByRecipe,
  canEdit,
  onError,
  onChange,
}: {
  templateId: string;
  row: TemplatePaintworkRow;
  backedByRecipe: boolean;
  canEdit: boolean;
  onError: (msg: string | null) => void;
  onChange: () => void;
}) {
  const t = useTranslations("templateDetail");
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
      const r = await updateTemplatePaintPart(templateId, row.id, {
        quantity: n,
      });
      if (!r.ok) {
        onError(r.error);
        setQty(String(row.quantity));
      } else onChange();
    });
  }

  function runRemove() {
    onError(null);
    start(async () => {
      const r = await removeTemplatePaintPart(templateId, row.id);
      if (!r.ok) onError(r.error);
      else onChange();
    });
  }

  return (
    <tr>
      <td className="px-4 py-2.5">
        {row.partTypeName}
        {backedByRecipe ? null : (
          <span className="text-money ml-2 text-xs">
            {t("paintworkUnbackedBadge")}
          </span>
        )}
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
            aria-label={t("paintQtyAria", { name: row.partTypeName })}
          />
        ) : (
          <span className="tabular-nums">{row.quantity}</span>
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
          <span className="text-money">{t("noPrice")}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        {row.lineTotalLabel ?? <span className="text-muted-foreground">—</span>}
      </td>
      {canEdit ? (
        <td className="px-4 py-2.5 text-right">
          <Button
            size="xs"
            variant="outline"
            onClick={runRemove}
            disabled={pending}
            aria-label={t("paintRemoveAria", { name: row.partTypeName })}
          >
            <Trash2 aria-hidden />
          </Button>
        </td>
      ) : null}
    </tr>
  );
}

function AddPaintworkRow({
  templateId,
  partTypes,
  onError,
  onChange,
}: {
  templateId: string;
  partTypes: PaintPartTypeOption[];
  onError: (msg: string | null) => void;
  onChange: () => void;
}) {
  const t = useTranslations("templateDetail");
  const [partTypeId, setPartTypeId] = useState("");
  const [qty, setQty] = useState("1");
  const [isPending, start] = useTransition();

  function onAdd() {
    onError(null);
    if (!partTypeId) {
      onError(t("pickPartTypeError"));
      return;
    }
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) {
      onError(t("qtyError"));
      return;
    }
    start(async () => {
      const r = await addTemplatePaintPart(templateId, {
        servicePartTypeId: partTypeId,
        quantity: n,
      });
      if (!r.ok) {
        onError(r.error);
        return;
      }
      setPartTypeId("");
      setQty("1");
      onChange();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={partTypeId} onValueChange={setPartTypeId}>
        <SelectTrigger
          size="sm"
          className="w-[160px]"
          aria-label={t("partTypeAria")}
        >
          <SelectValue placeholder={t("partTypePlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {partTypes.length === 0 ? (
            <div className="text-muted-foreground p-2 text-xs">
              {t("allDeclared")}
            </div>
          ) : (
            partTypes.map((pt) => (
              <SelectItem key={pt.id} value={pt.id}>
                {pt.name_en}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        disabled={isPending}
        className="h-8 w-16 tabular-nums"
        aria-label={t("qtyPerBikeAria")}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onAdd}
        disabled={isPending || partTypeId === ""}
      >
        <Plus aria-hidden /> {t("add")}
      </Button>
    </div>
  );
}
