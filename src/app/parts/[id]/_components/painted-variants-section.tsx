import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ColorChip } from "@/components/color-swatch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatQuantity } from "@/lib/parts/stock";
import { formatDateTime } from "@/lib/parts/format";

import {
  AdjustStockDialog,
  type CurrencyOption,
  type LocationOption,
} from "./adjust-stock-dialog";
import { RecordPaintedStockDialog } from "./record-painted-stock-dialog";
import { Section } from "./section";

export type PaintedVariantRow = {
  partId: string;
  sku: string;
  colourName: string;
  colourHex: string | null;
  colourFinish: string | null;
  onHand: number;
  /** Newest movement on this variant, for the parallel with Stock. */
  lastMovementAt: string | null;
  /** This variant's own prevailing cost (raw + paint), pre-filled on adjust. */
  prevailingCostDkk: number | null;
  /**
   * Active locations carrying THIS variant's on-hand. Per row, not shared:
   * `currentOnHand` drives the dialog's "Currently N on hand", its resulting
   * -quantity preview and the delta "Set on-hand to…" writes, so the base
   * part's figure here would corrupt the ledger.
   */
  locations: LocationOption[];
};

export type VariantBase = {
  partId: string;
  sku: string;
  name: string;
  colourName: string;
  colourHex: string | null;
};

/**
 * Painted parts are stock (docs/plan-painted-parts.md). On a RAW part this
 * lists its painted variants with on-hand per colour — the answer to "how many
 * painted X do I have?". On a VARIANT it says what it was painted from. Both
 * are read-only here: variants are born when a stock paint order comes back,
 * never typed in.
 */
export async function PaintedVariantsSection({
  paintableAs,
  variants,
  base,
  currencies = [],
  primaryLocationId = null,
  hideLocations = false,
  record = null,
}: {
  /** The service part type this part is paintable as (localized), or null. */
  paintableAs: string | null;
  variants: PaintedVariantRow[];
  /** Set when THIS part is a painted variant. */
  base: VariantBase | null;
  /** Adjust-dialog inputs, same sources the Stock panel uses. */
  currencies?: CurrencyOption[];
  primaryLocationId?: string | null;
  hideLocations?: boolean;
  /**
   * Everything the "Record painted stock" action needs. Null when this part
   * isn't a raw paintable part — then there is nothing to record and the
   * header carries no action.
   */
  record?: React.ComponentProps<typeof RecordPaintedStockDialog> | null;
}) {
  const t = await getTranslations("parts");
  const painted = variants.reduce((sum, v) => sum + v.onHand, 0);

  if (base) {
    return (
      <Section
        title={t("paintedVariantTitle")}
        description={t("paintedVariantDesc")}
      >
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t("variantOfPrefix")}</span>
          <Link href={`/parts/${base.partId}`} className="font-medium hover:underline">
            {base.name}
          </Link>
          <span className="text-muted-foreground font-mono text-xs">{base.sku}</span>
          <ColorChip hex={base.colourHex} label={base.colourName} />
        </p>
      </Section>
    );
  }

  return (
    <Section
      /* Same hue as Stock, deliberately: a painted cargo bed IS stock (the
         painted-parts doctrine). Two adjacent panels in one wash normally
         weakens what hue carries; here it is the statement. */
      title={t("paintedStockTitle")}
      description={
        paintableAs
          ? t("paintedStockDesc")
          : t("paintedVariantsNotPaintable")
      }
      hue="brand"
      action={record ? <RecordPaintedStockDialog {...record} /> : null}
    >
      {variants.length === 0 ? (
        <div className="text-ink-2 bg-surface flex h-16 items-center justify-center rounded-lg px-4 text-center text-sm">
          {paintableAs ? t("paintedVariantsNone") : t("paintedVariantsMarkHint")}
        </div>
      ) : (
        <>
          {/* bg-surface, not bg-ground: inside a hued panel, ground reads as
              muddy near-white (CLAUDE.md section tinting). Mirrors the
              stock-by-location table, which is the same shape — rows with a
              count and their own Adjust button. */}
          <div className="bg-surface overflow-hidden rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("thColour")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("thVariantSku")}
                  </TableHead>
                  <TableHead className="text-right">{t("thOnHand")}</TableHead>
                  <TableHead className="text-muted-foreground hidden text-xs sm:table-cell">
                    {t("thLastMovement")}
                  </TableHead>
                  <TableHead className="w-[90px] text-right sm:w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.partId}>
                    {/* The WHOLE row is the link, not just the colour chip.
                        Only the chip was clickable before, so the table read
                        as a dead end and nobody found the variant's page. */}
                    <TableCell className="p-0">
                      <Link
                        href={`/parts/${v.partId}`}
                        className="flex items-center gap-2 px-4 py-2.5 hover:underline"
                      >
                        <ColorChip hex={v.colourHex} label={v.colourName} />
                        {v.colourFinish ? (
                          <span className="text-muted-foreground text-xs">
                            {v.colourFinish}
                          </span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 sm:table-cell">
                      <Link
                        href={`/parts/${v.partId}`}
                        className="text-muted-foreground block px-4 py-2.5 font-mono text-xs hover:underline"
                      >
                        {v.sku}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right">
                      <Link
                        href={`/parts/${v.partId}`}
                        className="block px-4 py-2.5 font-medium tabular-nums hover:underline"
                      >
                        {formatQuantity(v.onHand)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                      {formatDateTime(v.lastMovementAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Its own prevailing cost — raw + the frozen paint
                          price — not the base part's raw figure. */}
                      <AdjustStockDialog
                        partId={v.partId}
                        partName={v.sku}
                        locations={v.locations}
                        defaultLocationId={
                          hideLocations
                            ? (primaryLocationId ?? undefined)
                            : undefined
                        }
                        hideLocation={hideLocations}
                        triggerVariant="row"
                        currencies={currencies}
                        prevailingCostDkk={v.prevailingCostDkk}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-ink-2 mt-2 text-right text-xs">
            {t("paintedTotal", { count: formatQuantity(painted) })}
          </p>
        </>
      )}
    </Section>
  );
}
