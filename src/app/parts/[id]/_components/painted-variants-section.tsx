import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
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

import { Section } from "./section";

export type PaintedVariantRow = {
  partId: string;
  sku: string;
  colourName: string;
  colourHex: string | null;
  colourFinish: string | null;
  onHand: number;
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
}: {
  /** The service part type this part is paintable as (localized), or null. */
  paintableAs: string | null;
  variants: PaintedVariantRow[];
  /** Set when THIS part is a painted variant. */
  base: VariantBase | null;
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
      title={t("paintedVariantsTitle")}
      description={
        paintableAs
          ? t("paintedVariantsDesc", { type: paintableAs })
          : t("paintedVariantsNotPaintable")
      }
    >
      {variants.length === 0 ? (
        <div className="text-ink-3 bg-ground flex h-16 items-center justify-center rounded-lg px-4 text-center text-sm">
          {paintableAs ? t("paintedVariantsNone") : t("paintedVariantsMarkHint")}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thColour")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("thVariantSku")}</TableHead>
                <TableHead className="text-right">{t("thOnHand")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.map((v) => (
                <TableRow key={v.partId} className="hover:bg-muted/50">
                  <TableCell className="p-0">
                    <Link
                      href={`/parts/${v.partId}`}
                      className="flex items-center gap-2 px-4 py-2.5 hover:underline"
                    >
                      <ColorChip hex={v.colourHex} label={v.colourName} />
                      {v.colourFinish ? (
                        <span className="text-muted-foreground text-xs">{v.colourFinish}</span>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden font-mono text-xs sm:table-cell">
                    {v.sku}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {v.onHand <= 0 ? (
                      <Badge variant="outline" className="font-normal">
                        {formatQuantity(v.onHand)}
                      </Badge>
                    ) : (
                      formatQuantity(v.onHand)
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground mt-2 text-right text-xs">
            {t("paintedTotal", { count: formatQuantity(painted) })}
          </p>
        </>
      )}
    </Section>
  );
}
