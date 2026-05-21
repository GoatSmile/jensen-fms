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
  family: string | null;
  frameSize: string;
  bikeTypeName: string | null;
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
              <div className="overflow-x-auto rounded-md border md:overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead className="text-right">Qty / bike</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((t) => (
                      <TableRow key={t.templateId}>
                        <TableCell className="min-w-0 whitespace-normal">
                          <Link
                            href={`/bike-templates/${t.templateId}`}
                            className="font-medium break-words hover:underline"
                          >
                            {[t.family, t.frameSize, t.templateName]
                              .filter(Boolean)
                              .join(" · ")}
                          </Link>
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            v{t.templateVersion}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                          {t.bikeTypeName ?? "—"}
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
              <div className="overflow-x-auto rounded-md border md:overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>MO number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden text-right md:table-cell">
                        Qty / bike
                      </TableHead>
                      <TableHead className="hidden text-right md:table-cell">
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
                        <TableCell className="hidden text-right tabular-nums md:table-cell">
                          {mo.qtyPerBike}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">
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
