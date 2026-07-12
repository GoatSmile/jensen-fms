import { getTranslations } from "next-intl/server";

import { Field } from "@/components/field";
import { CollapsibleSection } from "@/components/collapsible-section";
import { formatDkk } from "@/lib/parts/stock";
import { formatDate } from "@/lib/parts/format";

type Props = {
  descriptionEn: string | null;
  descriptionDa: string | null;
  unitOfMeasure: string;
  weightGrams: number | null;
  lastCostDkk: number | null;
  lastCostDate: string | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  notes: string | null;
  attributes: Record<string, unknown>;
  /** Count of CURRENT bike templates that include this part. */
  templateUsageCount?: number;
};

export async function DetailsSection({
  descriptionEn,
  descriptionDa,
  unitOfMeasure,
  weightGrams,
  lastCostDkk,
  lastCostDate,
  reorderPoint,
  reorderQuantity,
  notes,
  attributes,
  templateUsageCount,
}: Props) {
  const t = await getTranslations("partDetail");
  const attributeEntries = Object.entries(attributes ?? {});

  return (
    // Folded by default — reference data, not daily-flow data. The
    // open/closed choice sticks per browser via localStorage.
    <CollapsibleSection
      title={t("detailsTitle")}
      description={t("detailsDescription")}
      storageKey="collapse:parts-details"
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label={t("descriptionEn")}>
          {descriptionEn ?? <Muted>—</Muted>}
        </Field>
        <Field label={t("descriptionDa")}>
          {descriptionDa ?? <Muted>—</Muted>}
        </Field>
        <Field label={t("unitOfMeasure")}>
          <span className="font-mono text-xs">{unitOfMeasure}</span>
        </Field>
        <Field label={t("weight")}>
          {weightGrams != null ? (
            <span className="tabular-nums">{weightGrams} g</span>
          ) : (
            <Muted>—</Muted>
          )}
        </Field>
        <Field label={t("lastLandedCost")}>
          {lastCostDkk != null ? (
            <span className="tabular-nums">
              {formatDkk(lastCostDkk)}
              {lastCostDate ? (
                <span className="text-muted-foreground">
                  {t("asOf", { date: formatDate(lastCostDate) })}
                </span>
              ) : null}
            </span>
          ) : (
            <Muted>—</Muted>
          )}
        </Field>
        <Field label={t("reorderPoint")}>
          {reorderPoint != null ? (
            <span className="tabular-nums">{reorderPoint}</span>
          ) : (
            <Muted>—</Muted>
          )}
        </Field>
        <Field label={t("reorderQuantity")}>
          {reorderQuantity != null ? (
            <span className="tabular-nums">{reorderQuantity}</span>
          ) : (
            <Muted>—</Muted>
          )}
        </Field>
        <Field label={t("notes")}>{notes ? notes : <Muted>—</Muted>}</Field>
        <Field label={t("usedInTemplates")}>
          {templateUsageCount != null && templateUsageCount > 0 ? (
            <span className="tabular-nums">
              {t("templateVersions", { count: templateUsageCount })}
            </span>
          ) : (
            <Muted>{t("none")}</Muted>
          )}
        </Field>
      </dl>
      {attributeEntries.length > 0 ? (
        <div className="mt-4 border-t pt-3">
          <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            {t("attributesTitle")}
          </h3>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {attributeEntries.map(([key, value]) => (
              <Field key={key} label={key}>
                <span className="font-mono text-xs break-all">
                  {formatAttributeValue(value)}
                </span>
              </Field>
            ))}
          </dl>
        </div>
      ) : null}
    </CollapsibleSection>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function formatAttributeValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
