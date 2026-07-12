import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/section";
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
import { formatDate } from "@/lib/parts/format";

export type LinkedMORow = {
  id: string;
  mo_number: string;
  status: MOStatus;
  target_quantity: number;
  completed_quantity: number;
  planned_completion_date: string | null;
  templateLabel: string | null;
};

export async function LinkedMOsSection({ rows }: { rows: LinkedMORow[] }) {
  const [t, tMoStatus] = await Promise.all([
    getTranslations("soDetail"),
    getTranslations("moStatus"),
  ]);
  return (
    <Section
      title={t("linkedMosTitle")}
      description={t("linkedMosDesc")}
      className="border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20"
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">{t("noMos")}</p>
      ) : (
        <div className="bg-background overflow-x-auto rounded-md border md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thMo")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("thTemplate")}
                </TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="text-right">{t("thProgress")}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  {t("thPlannedCompletion")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((mo) => {
                const pct =
                  mo.target_quantity > 0
                    ? Math.round(
                        (mo.completed_quantity / mo.target_quantity) * 100,
                      )
                    : 0;
                return (
                  <TableRow key={mo.id} className="hover:bg-muted/50">
                    <TableCell className="p-0 font-mono text-xs">
                      <Link
                        href={`/manufacturing-orders/${mo.id}`}
                        className="block px-4 py-2.5 hover:underline"
                      >
                        {mo.mo_number}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {mo.templateLabel ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={MO_STATUS_VARIANT[mo.status] ?? "outline"}
                      >
                        {tMoStatus.has(mo.status) ? tMoStatus(mo.status) : mo.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {mo.completed_quantity}/{mo.target_quantity}{" "}
                      <span className="text-muted-foreground text-[10px]">
                        ({pct}%)
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right text-xs lg:table-cell">
                      {formatDate(mo.planned_completion_date)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
