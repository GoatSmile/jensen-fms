"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ColorChip } from "@/components/color-swatch";
import { formatPrice } from "@/lib/format";
import { formatQuantity } from "@/lib/parts/stock";
import {
  planPaintSeed,
  type SeedBike,
  type SeedRecipePart,
  type SeedTemplateRow,
} from "@/lib/services/paint-seed";
import {
  priceOrderItems,
  tierLabel,
  type ResolvedItemPrice,
  type ServicePriceItem,
} from "@/lib/services/pricing";

/** A painter part type, name already localized by the page. */
export type PreviewPartType = { id: string; name: string; sortOrder: number };

/** A recipe part that is paintable as some type. `parts.name_en` is
 * deliberately English app-wide, so there is nothing to localize here. */
export type PreviewPart = { id: string; sku: string; name: string };

/** One painter's CURRENT price list. Never used for another supplier. */
export type PreviewPriceList = {
  supplierId: string;
  name: string;
  currency: string;
  items: ServicePriceItem[];
};

type Props = {
  /** Bike ids currently ticked, in the bikes panel above. */
  selectedBikeIds: string[];
  /** Every eligible bike's template, so the seed can expand its recipe. */
  bikeTemplates: { id: string; templateId: string | null }[];
  paintworkRows: SeedTemplateRow[];
  recipeParts: SeedRecipePart[];
  partTypes: PreviewPartType[];
  parts: PreviewPart[];
  priceLists: PreviewPriceList[];
  /** Frame + fork, mirroring the action's empty-plan fallback. */
  fallbackPartTypeIds: string[];
  supplierId: string;
  supplierName: string | null;
  colorId: string;
  colorName: string | null;
  colorHex: string | null;
};

/**
 * What this batch actually sends to the painter, before you create it.
 *
 * The page used to ask which bikes go and then label the button "1 frame" — a
 * count of BIKES that reads as "only the frame gets painted". It isn't:
 * `planPaintSeed` expands every part a template declares to the painter, and
 * falls back to the recipe's parts marked *Paintable as* when a template
 * declares none. That was invisible until the order already existed.
 *
 * Two rules hold this honest:
 *
 * 1. **The same pure functions the action uses.** `planPaintSeed` and
 *    `priceOrderItems` run here on the same inputs `createPaintOrderFromSO`
 *    seeds from, so a preview that disagrees with the created order is not
 *    possible. Anything this screen computes for itself would be a second
 *    source of truth, and it would drift.
 * 2. **It mirrors the action's quirks, including the ones we would rather not
 *    have.** The batch colour OVERRIDES each bike's own colour, and an empty
 *    plan becomes frame + fork starter lines. Preview them, or the screen
 *    lies at the one moment it is being trusted.
 */
export function PaintworkPreview({
  selectedBikeIds,
  bikeTemplates,
  paintworkRows,
  recipeParts,
  partTypes,
  parts,
  priceLists,
  fallbackPartTypeIds,
  supplierId,
  supplierName,
  colorId,
  colorName,
  colorHex,
}: Props) {
  const t = useTranslations("soDetail");

  const partTypeById = useMemo(
    () => new Map(partTypes.map((p) => [p.id, p])),
    [partTypes],
  );
  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const list = useMemo(
    () => priceLists.find((l) => l.supplierId === supplierId) ?? null,
    [priceLists, supplierId],
  );

  const { rows, plan, isFallback, total, currency, unpricedCount } =
    useMemo(() => {
      const selected = new Set(selectedBikeIds);
      // Colour comes from the FORM, not the bike — the action overrides it,
      // because a batch is one colour by construction.
      const seedBikes: SeedBike[] = bikeTemplates
        .filter((b) => selected.has(b.id))
        .map((b) => ({
          id: b.id,
          templateId: b.templateId,
          colorId: colorId || null,
        }));

      const plan = planPaintSeed(seedBikes, paintworkRows, recipeParts);

      // The action's fallback: nothing marked anywhere ⇒ a frame and a fork
      // line, by type only, one per selected bike.
      const isFallback = plan.lines.length === 0 && seedBikes.length > 0;
      const lines = isFallback
        ? fallbackPartTypeIds.map((partTypeId) => ({
            servicePartTypeId: partTypeId,
            partId: null as string | null,
            colorId: colorId || null,
            quantity: seedBikes.length,
          }))
        : plan.lines;

      const rows = lines
        .map((l, i) => ({
          // Synthetic id: the pricer only needs it to key its result map.
          id: `${l.servicePartTypeId}::${l.partId ?? ""}::${i}`,
          servicePartTypeId: l.servicePartTypeId,
          partId: l.partId,
          quantity: l.quantity,
        }))
        .sort(
          (a, b) =>
            (partTypeById.get(a.servicePartTypeId)?.sortOrder ?? 0) -
              (partTypeById.get(b.servicePartTypeId)?.sortOrder ?? 0) ||
            (partById.get(a.partId ?? "")?.sku ?? "").localeCompare(
              partById.get(b.partId ?? "")?.sku ?? "",
            ),
        );

      // priceOrderItems speaks the DB's snake_case shape; the tier basis it
      // computes is the part type's total across the whole order, which is
      // exactly what makes ticking a bike move a line into a cheaper tier.
      const priced = list
        ? priceOrderItems(
            { items: list.items },
            rows.map((r) => ({
              id: r.id,
              service_part_type_id: r.servicePartTypeId,
              quantity: r.quantity,
            })),
          )
        : {
            byItemId: new Map<string, ResolvedItemPrice | null>(),
            total: 0,
            unpricedCount: rows.length,
          };

      return {
        rows: rows.map((r) => ({ ...r, priced: priced.byItemId.get(r.id) ?? null })),
        plan,
        isFallback,
        total: list ? priced.total : null,
        currency: list?.currency ?? null,
        unpricedCount: list ? priced.unpricedCount : 0,
      };
    }, [
      selectedBikeIds,
      bikeTemplates,
      paintworkRows,
      recipeParts,
      fallbackPartTypeIds,
      colorId,
      list,
      partTypeById,
      partById,
    ]);

  const partCount = rows.reduce((sum, r) => sum + r.quantity, 0);
  const hasRows = rows.length > 0;

  return (
    <Panel
      title={t("paintworkTitle")}
      description={
        rows.length === 0
          ? t("paintworkEmptyDesc")
          : t("paintworkDesc", { parts: partCount, lines: rows.length })
      }
    >
      {rows.length === 0 ? (
        <p className="bg-ground text-ink-2 rounded-md px-4 py-6 text-center text-sm">
          {selectedBikeIds.length === 0
            ? t("paintworkNoBikes")
            : t("paintworkNothingMarked")}
        </p>
      ) : (
        <>
          {/* No wrapper, no fold, no scroller. The seed aggregates by part
              type × part × colour, so twenty bikes of one template is still
              four lines at qty 20 — the panel is small by construction, and
              hiding the answer would restore the silence it exists to end. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thPaintPartType")}</TableHead>
                <TableHead>{t("thPaintPart")}</TableHead>
                <TableHead>{t("thPaintColour")}</TableHead>
                <TableHead className="text-right">
                  {t("thPaintQty")}
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  {t("thPaintUnitPrice")}
                </TableHead>
                <TableHead className="text-right">
                  {t("thPaintLineTotal")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const partType = partTypeById.get(r.servicePartTypeId);
                const part = r.partId ? partById.get(r.partId) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {partType?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {part ? (
                        <span className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs">
                            {part.sku}
                          </span>
                          <span className="text-ink-2 text-xs">
                            {part.name}
                          </span>
                        </span>
                      ) : (
                        <Badge variant="warning">
                          {t("paintworkByTypeOnly")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {colorName ? (
                        <ColorChip hex={colorHex} label={colorName} />
                      ) : (
                        <span className="text-ink-2">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(r.quantity)}
                    </TableCell>
                    <TableCell className="hidden text-right sm:table-cell">
                      {r.priced && currency ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="outline" className="font-normal">
                            {tierLabel(r.priced.item)}
                          </Badge>
                          <span className="tabular-nums">
                            {formatPrice(r.priced.item.unit_price, currency)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-money">
                          {t("paintworkNoPrice")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.priced && currency ? (
                        formatPrice(r.priced.lineTotal, currency)
                      ) : (
                        <span className="text-ink-2">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {total != null && currency ? (
            <p className="flex items-baseline justify-between px-2 pt-3 text-sm">
              <span className="text-ink-2">{t("paintworkEstimate")}</span>
              <span className="font-medium tabular-nums">
                {formatPrice(total, currency)}
              </span>
            </p>
          ) : null}
        </>
      )}

      {/* Every honest caveat the seed can report, at the moment it matters
          rather than after the order exists. The pricing ones are gated on
          there being a line to price — with nothing ticked they are noise
          about lines that do not exist. */}
      <div className="text-ink-2 flex flex-col gap-1 px-2 pt-3 text-xs">
        {hasRows && !supplierId ? <p>{t("paintworkPickSupplier")}</p> : null}
        {hasRows && supplierId && !list ? (
          <p className="text-money">
            {t("paintworkSupplierNoList", { supplier: supplierName ?? "—" })}
          </p>
        ) : null}
        {hasRows && list && unpricedCount > 0 ? (
          <p className="text-money">
            {t("paintworkUnpriced", { count: unpricedCount })}
          </p>
        ) : null}
        {hasRows && !colorId ? <p>{t("paintworkPickColour")}</p> : null}
        {isFallback ? (
          <p className="text-money">{t("paintworkFallback")}</p>
        ) : null}
        {plan.bikesWithoutPaintwork > 0 ? (
          <p className="text-money">
            {t("paintworkBikesUnmarked", {
              count: plan.bikesWithoutPaintwork,
            })}
          </p>
        ) : null}
        {plan.bikesWithoutTemplate > 0 ? (
          <p>
            {t("paintworkBikesNoTemplate", {
              count: plan.bikesWithoutTemplate,
            })}
          </p>
        ) : null}
        {hasRows ? <p>{t("paintworkEditable")}</p> : null}
      </div>
    </Panel>
  );
}
