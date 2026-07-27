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
import { Panel } from "@/components/ui/panel";
import { formatDate } from "@/lib/parts/format";

export type VersionRow = {
  id: string;
  version: number;
  isCurrent: boolean;
  createdAt: string;
  partCount: number;
};

type Props = {
  rows: VersionRow[];
  thisTemplateId: string;
};

export async function VersionHistorySection({ rows, thisTemplateId }: Props) {
  if (rows.length <= 1) return null;
  const t = await getTranslations("templateDetail");
  return (
    <Panel
      title={t("versionHistoryTitle")}
      description={t("versionHistoryDescription")}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px] text-right">
              {t("thVersionCol")}
            </TableHead>
            <TableHead>{t("thCreated")}</TableHead>
            <TableHead className="text-right">{t("thPartsCol")}</TableHead>
            <TableHead>{t("thState")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isThis = row.id === thisTemplateId;
            return (
              <TableRow
                key={row.id}
                className={isThis ? "bg-muted/40" : ""}
              >
                <TableCell className="text-right tabular-nums">
                  <Link
                    href={`/bike-templates/${row.id}`}
                    className="font-medium hover:underline"
                  >
                    v{row.version}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {formatDate(row.createdAt)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.partCount}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {row.isCurrent ? (
                      <Badge variant="success">{t("currentBadge")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("pastBadge")}</Badge>
                    )}
                    {isThis ? (
                      <span className="text-muted-foreground text-xs">
                        {t("youAreHere")}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          </TableBody>
      </Table>
    </Panel>
  );
}
