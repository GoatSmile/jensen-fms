import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/parts/format";
import { BIKE_STATUS_VARIANT, type BikeStatus } from "@/lib/bikes/status";

import { EmptyRow, Section } from "./section";

export type StateLogRow = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  occurredAt: string;
  reason: string | null;
};

export function StateLogSection({ rows }: { rows: StateLogRow[] }) {
  const t = useTranslations("bikeDetail.log");
  const tStatus = useTranslations("bikeStatus");
  return (
    <Section title={t("title")} description={t("desc")}>
      {rows.length === 0 ? (
        <EmptyRow>{t("empty")}</EmptyRow>
      ) : (
        <div className="overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] sm:w-[180px]">
                  {t("thWhen")}
                </TableHead>
                <TableHead>{t("thTransition")}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {t("thReason")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDateTime(row.occurredAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.fromStatus ? (
                        <Badge
                          variant={
                            BIKE_STATUS_VARIANT[row.fromStatus as BikeStatus] ??
                            "outline"
                          }
                        >
                          {tStatus(row.fromStatus)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {t("created")}
                        </span>
                      )}
                      <ArrowRight aria-hidden className="size-3" />
                      <Badge
                        variant={
                          BIKE_STATUS_VARIANT[row.toStatus as BikeStatus] ??
                          "outline"
                        }
                      >
                        {tStatus(row.toStatus)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-[320px] truncate text-xs sm:table-cell">
                    {row.reason ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
