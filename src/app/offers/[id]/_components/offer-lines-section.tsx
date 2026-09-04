"use client";

import { useTranslations } from "next-intl";

import { CommercialLinesSection } from "@/components/commercial/lines-section";
import type { CommercialLineRow } from "@/lib/commercial/lines";

import { LineImageCell } from "./line-image-cell";

import {
  addOfferLine,
  deleteOfferLine,
  updateOfferLine,
} from "../../_actions/manage-offer-lines";

/**
 * The offer's lines panel — the shared commercial-lines table bound to the
 * offer's writers, with the one thing an offer line has that a sales-order line
 * does not: a picture. It hangs on `renderItemExtra`, the slot the shared
 * section exposes for exactly this, so the table itself stays document-blind.
 */
export function OfferLinesSection({
  offerId,
  currency,
  defaultVatCode,
  editable,
  rows,
  imagesByLine,
  parts,
  templates,
  vatCodes,
  colors,
}: {
  offerId: string;
  currency: string;
  defaultVatCode: string | null;
  editable: boolean;
  rows: CommercialLineRow[];
  /** line id → its picture, if one has been attached. */
  imagesByLine: Record<string, string>;
  parts: React.ComponentProps<typeof CommercialLinesSection>["parts"];
  templates: React.ComponentProps<typeof CommercialLinesSection>["templates"];
  vatCodes: React.ComponentProps<typeof CommercialLinesSection>["vatCodes"];
  colors: React.ComponentProps<typeof CommercialLinesSection>["colors"];
}) {
  const t = useTranslations("offerDetail");

  return (
    <CommercialLinesSection
      title={t("linesTitle")}
      description={editable ? t("linesDescEditable") : t("linesDescLocked")}
      currency={currency}
      defaultVatCode={defaultVatCode}
      editable={editable}
      rows={rows}
      parts={parts}
      templates={templates}
      vatCodes={vatCodes}
      colors={colors}
      renderItemExtra={(row) => (
        <LineImageCell
          lineId={row.id}
          imageUrl={imagesByLine[row.id] ?? null}
          editable={editable}
        />
      )}
      onAdd={(fd) => addOfferLine(offerId, fd)}
      onUpdate={(lineId, fd) => updateOfferLine(lineId, fd)}
      onDelete={(lineId) => deleteOfferLine(lineId)}
    />
  );
}
