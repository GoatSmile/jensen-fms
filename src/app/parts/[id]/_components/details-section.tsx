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

export function DetailsSection({
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
  const attributeEntries = Object.entries(attributes ?? {});

  return (
    // Folded by default — reference data, not daily-flow data. The
    // open/closed choice sticks per browser via localStorage.
    <CollapsibleSection
      title="Details"
      description="Descriptions, specs, reorder settings, attributes"
      storageKey="collapse:parts-details"
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Description (English)">
          {descriptionEn ?? <Muted>—</Muted>}
        </Field>
        <Field label="Beskrivelse (Dansk)">
          {descriptionDa ?? <Muted>—</Muted>}
        </Field>
        <Field label="Unit of measure">
          <span className="font-mono text-xs">{unitOfMeasure}</span>
        </Field>
        <Field label="Weight">
          {weightGrams != null ? (
            <span className="tabular-nums">{weightGrams} g</span>
          ) : (
            <Muted>—</Muted>
          )}
        </Field>
        <Field label="Last landed cost">
          {lastCostDkk != null ? (
            <span className="tabular-nums">
              {formatDkk(lastCostDkk)}
              {lastCostDate ? (
                <span className="text-muted-foreground">
                  {" "}
                  · as of {formatDate(lastCostDate)}
                </span>
              ) : null}
            </span>
          ) : (
            <Muted>—</Muted>
          )}
        </Field>
        <Field label="Reorder point">
          {reorderPoint != null ? (
            <span className="tabular-nums">{reorderPoint}</span>
          ) : (
            <Muted>—</Muted>
          )}
        </Field>
        <Field label="Reorder quantity">
          {reorderQuantity != null ? (
            <span className="tabular-nums">{reorderQuantity}</span>
          ) : (
            <Muted>—</Muted>
          )}
        </Field>
        <Field label="Notes">{notes ? notes : <Muted>—</Muted>}</Field>
        <Field label="Used in templates">
          {templateUsageCount != null && templateUsageCount > 0 ? (
            <span className="tabular-nums">
              {templateUsageCount} current version
              {templateUsageCount === 1 ? "" : "s"}
            </span>
          ) : (
            <Muted>None</Muted>
          )}
        </Field>
      </dl>
      {attributeEntries.length > 0 ? (
        <div className="mt-4 border-t pt-3">
          <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            Attributes
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
