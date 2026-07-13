import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPct } from "@/lib/parts/format";

export type HsCodeRow = {
  id: string;
  code: string;
  description: string;
  tariffPct: number;
  notes: string | null;
  isActive: boolean;
  partCount: number;
};

/**
 * Server component — rows are <Link>s into /admin/hs-codes/[id]. Edit
 * + Archive live on the detail page now, matching /admin/colors and
 * /admin/customer-segments.
 */
export async function HsCodesSection({ rows }: { rows: HsCodeRow[] }) {
  const t = await getTranslations("adminHsCodes");
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">{t("sectionTitle")}</h2>
          <span className="text-muted-foreground text-xs">
            {t("countSummary", { active: activeCount, total: rows.length })}
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/hs-codes/new">
            <Plus aria-hidden /> {t("addCode")}
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm italic">
          {t("emptyState")}
        </p>
      ) : (
        <div className="overflow-x-auto md:overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thCode")}</TableHead>
                <TableHead>{t("thDescription")}</TableHead>
                <TableHead className="text-right">{t("thTariff")}</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("thParts")}
                </TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const href = `/admin/hs-codes/${row.id}`;
                return (
                  <TableRow
                    key={row.id}
                    className={`hover:bg-muted/50 cursor-pointer ${row.isActive ? "" : "opacity-60"}`}
                  >
                    <TableCell className="p-0 font-mono text-xs">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.code}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-sm">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.description}
                        {row.notes ? (
                          <div className="text-muted-foreground text-xs">
                            {row.notes}
                          </div>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right tabular-nums">
                      <Link href={href} className="block px-4 py-2.5">
                        {formatPct(row.tariffPct)}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.partCount}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.isActive ? (
                          <Badge variant="success">{t("statusActive")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("statusArchived")}</Badge>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0 text-right">
                      <Link
                        href={href}
                        className="text-muted-foreground block px-3 py-2.5"
                        aria-label={t("openAria", { code: row.code })}
                      >
                        <ChevronRight className="size-4" aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
