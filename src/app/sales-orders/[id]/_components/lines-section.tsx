"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { CommercialLinesSection } from "@/components/commercial/lines-section";
import type { CommercialLineRow } from "@/lib/commercial/lines";

import {
  addSOLine,
  deleteSOLine,
  updateSOLine,
} from "../../_actions/manage-so-lines";
import { SpawnMoButton } from "./spawn-mo-button";

/**
 * The sales order's lines panel — the shared commercial-lines table plus the
 * two things only a sales order has: the "Spawn MO" button beside a template,
 * and the badge counting the MOs a line already spawned.
 */

export type SOLineRow = CommercialLineRow & {
  /** Active MOs (not cancelled) spawned from this line. Drives both the badge
   *  and whether "Spawn MO" is still offered. */
  linkedMoCount: number;
};

type Props = {
  soId: string;
  currency: string;
  defaultVatCode: string | null;
  editable: boolean;
  /** When true, "Spawn MO" is shown on template lines that don't already have
   *  an active MO. Allowed in draft/confirmed/in_production. */
  canSpawn: boolean;
  rows: SOLineRow[];
  parts: React.ComponentProps<typeof CommercialLinesSection>["parts"];
  templates: React.ComponentProps<typeof CommercialLinesSection>["templates"];
  vatCodes: React.ComponentProps<typeof CommercialLinesSection>["vatCodes"];
  colors: React.ComponentProps<typeof CommercialLinesSection>["colors"];
};

export function LinesSection({
  soId,
  currency,
  defaultVatCode,
  editable,
  canSpawn,
  rows,
  parts,
  templates,
  vatCodes,
  colors,
}: Props) {
  const t = useTranslations("soDetail");
  const linkedMoCounts = new Map(rows.map((r) => [r.id, r.linkedMoCount]));

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
      onAdd={(fd) => addSOLine(soId, fd)}
      onUpdate={(lineId, fd) => updateSOLine(lineId, fd)}
      onDelete={(lineId) => deleteSOLine(lineId)}
      renderItemExtra={(row, h) =>
        canSpawn && (linkedMoCounts.get(row.id) ?? 0) === 0 ? (
          <SpawnMoButton
            soId={soId}
            lineId={row.id}
            disabled={h.pending}
            onError={h.onError}
          />
        ) : null
      }
      renderItemBadges={(row) => {
        const count = linkedMoCounts.get(row.id) ?? 0;
        return count > 0 ? (
          <Badge variant="secondary" className="mt-1 text-[10px]">
            {t("moBadge", { count })}
          </Badge>
        ) : null;
      }}
    />
  );
}
