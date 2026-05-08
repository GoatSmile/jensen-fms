import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MO_STATUS_VARIANT,
  moStatusLabel,
  type MOStatus,
} from "@/lib/mo/status";

import { EmptyRow, Section } from "./section";

export type TemplateUsageRow = {
  templateId: string;
  templateName: string;
  templateVersion: number;
  modelId: string | null;
  modelName: string | null;
  variantName: string | null;
  qtyPerBike: number;
};

export type MOUsageRow = {
  moId: string;
  moNumber: string;
  status: MOStatus;
  qtyPerBike: number;
  outstandingBikes: number;
};

type Props = {
  partId: string;
  templates: TemplateUsageRow[];
  mos: MOUsageRow[];
  installedBikeCount: number;
};

export function WhereUsedSection({
  partId,
  templates,
  mos,
  installedBikeCount,
}: Props) {
  const nothing =
    templates.length === 0 && mos.length === 0 && installedBikeCount === 0;

  return (
    <Section
      title="Where used"
      description="Current templates referencing this part, open MOs that need it, and bikes that have it installed."
    >
      {nothing ? (
        <EmptyRow>Not used in any template, MO, or bike yet.</EmptyRow>
      ) : (
        <div className="flex flex-col gap-4">
          {templates.length > 0 ? (
            <div>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                Current templates
              </h3>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead>Model · variant</TableHead>
                      <TableHead className="text-right">Qty / bike</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((t) => (
                      <TableRow key={t.templateId}>
                        <TableCell>
                          <Link
                            href={`/bike-templates/${t.templateId}`}
                            className="font-medium hover:underline"
                          >
                            {t.templateName}
                          </Link>
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            v{t.templateVersion}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {t.modelName ? (
                            <Link
                              href={`/bike-models/${t.modelId}`}
                              className="hover:underline"
                            >
                              {t.modelName}
                            </Link>
                          ) : (
                            "—"
                          )}
                          {t.variantName ? ` · ${t.variantName}` : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {t.qtyPerBike}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          {mos.length > 0 ? (
            <div>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                Open manufacturing orders
              </h3>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>MO number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Qty / bike</TableHead>
                      <TableHead className="text-right">
                        Outstanding bikes
                      </TableHead>
                      <TableHead className="text-right">
                        Total still needed
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mos.map((mo) => (
                      <TableRow key={mo.moId}>
                        <TableCell className="font-mono text-xs">
                          <Link
                            href={`/manufacturing-orders/${mo.moId}`}
                            className="hover:underline"
                          >
                            {mo.moNumber}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={MO_STATUS_VARIANT[mo.status] ?? "outline"}>
                            {moStatusLabel(mo.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {mo.qtyPerBike}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {mo.outstandingBikes}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {mo.qtyPerBike * mo.outstandingBikes}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          {installedBikeCount > 0 ? (
            <div>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                Installed on bikes
              </h3>
              <p className="text-sm">
                Currently installed on{" "}
                <Link
                  href={`/bikes?has-part=${partId}`}
                  className="font-medium hover:underline"
                >
                  {installedBikeCount}{" "}
                  {installedBikeCount === 1 ? "bike" : "bikes"}
                </Link>
                .
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}
