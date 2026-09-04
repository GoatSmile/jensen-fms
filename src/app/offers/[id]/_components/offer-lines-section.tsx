"use client";

import { useTranslations } from "next-intl";

import { CommercialLinesSection } from "@/components/commercial/lines-section";
import type { CommercialLineRow } from "@/lib/commercial/lines";

import {
  addOfferLine,
  deleteOfferLine,
  updateOfferLine,
} from "../../_actions/manage-offer-lines";

/**
 * The offer's lines panel — the shared commercial-lines table bound to the
 * offer's writers. It carries no render slots of its own yet; what an offer
 * alone has (a picture per line) hangs on them next.
 */
export function OfferLinesSection({
  offerId,
  currency,
  defaultVatCode,
  editable,
  rows,
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
      onAdd={(fd) => addOfferLine(offerId, fd)}
      onUpdate={(lineId, fd) => updateOfferLine(lineId, fd)}
      onDelete={(lineId) => deleteOfferLine(lineId)}
    />
  );
}
