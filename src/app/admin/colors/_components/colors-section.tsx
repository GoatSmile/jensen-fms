import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColorSwatch } from "@/components/color-swatch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { colorFinishLabel } from "@/lib/colors/coating";

export type ColorRow = {
  id: string;
  slug: string;
  nameEn: string;
  nameDa: string;
  hex: string | null;
  ralCode: string | null;
  coating: string | null;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
};

/**
 * Server component (no client interaction needed). Rows are <Link>
 * wrappers → /admin/colors/[id], matching the rest of the app's "click
 * the row, get the entity's page" navigation pattern. Edit + Archive
 * live on the detail page now, so there's no 3-dot menu.
 */
export async function ColorsSection({ rows }: { rows: ColorRow[] }) {
  const t = await getTranslations("adminColors");
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
          <Link href="/admin/colors/new">
            <Plus aria-hidden /> {t("addColour")}
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
                <TableHead>{t("thColour")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("slug")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("thRalFinish")}</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t("thSort")}
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  {t("thInUse")}
                </TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const href = `/admin/colors/${row.id}`;
                return (
                  <TableRow
                    key={row.id}
                    className={`hover:bg-muted/50 cursor-pointer ${row.isActive ? "" : "opacity-60"}`}
                  >
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ColorSwatch
                            hex={row.hex}
                            ralCode={row.ralCode}
                            label={row.nameEn}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{row.nameEn}</span>
                            {row.nameDa && row.nameDa !== row.nameEn ? (
                              <span className="text-muted-foreground text-xs">
                                {row.nameDa}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 font-mono text-xs sm:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.slug}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-xs md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {colorFinishLabel(row.ralCode, row.coating) ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.sortOrder}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums lg:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.usageCount}
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
                        aria-label={t("openAria", { name: row.nameEn })}
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
