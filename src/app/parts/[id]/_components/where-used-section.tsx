import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MO_STATUS_VARIANT, type MOStatus } from "@/lib/mo/status";

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

export async function WhereUsedSection({
  partId,
  templates,
  mos,
  installedBikeCount,
}: Props) {
  const [t, tMoStatus] = await Promise.all([
    getTranslations("partDetail"),
    getTranslations("moStatus"),
  ]);
  const nothing =
    templates.length === 0 && mos.length === 0 && installedBikeCount === 0;

  return (
    <Section
      title={t("whereUsedTitle")}
      description={t("whereUsedDescription")}
    >
      {nothing ? (
        <EmptyRow>{t("notUsed")}</EmptyRow>
      ) : (
        <div className="flex flex-col gap-4">
          {templates.length > 0 ? (
            <div>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                {t("currentTemplates")}
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("thTemplate")}</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t("thTemplateType")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("thQtyPerBike")}
                    </TableHead>
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
          ) : null}

          {mos.length > 0 ? (
            <div>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                {t("openMos")}
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("thMoNumber")}</TableHead>
                    <TableHead>{t("thStatus")}</TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      {t("thQtyPerBike")}
                    </TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      {t("thOutstanding")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("thTotalNeeded")}
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
                          {tMoStatus(mo.status)}
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
          ) : null}

          {installedBikeCount > 0 ? (
            <div>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                {t("installedOnBikes")}
              </h3>
              <p className="text-sm">
                {t.rich("currentlyInstalled", {
                  link: (chunks) => (
                    <Link
                      href={`/bikes?has-part=${partId}`}
                      className="font-medium hover:underline"
                    >
                      {chunks}
                    </Link>
                  ),
                  count: installedBikeCount,
                })}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}
