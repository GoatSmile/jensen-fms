import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { localizedName } from "@/i18n/vocab";

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
import { Panel } from "@/components/ui/panel";

export type SegmentRow = {
  id: string;
  slug: string;
  nameEn: string;
  nameDa: string | null;
  descriptionEn: string | null;
  descriptionDa: string | null;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
};

/**
 * Server component (no client state needed) — rows are <Link>s into
 * /admin/customer-segments/[id]. Edit + Archive live on the detail
 * page now.
 */
export async function SegmentsSection({ rows }: { rows: SegmentRow[] }) {
  const [t, locale] = await Promise.all([
    getTranslations("adminSegments"),
    getLocale(),
  ]);
  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <Panel
      title={t("title")}
      description={t("countSummary", {
        active: activeCount,
        total: rows.length,
      })}
      action={
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/customer-segments/new">
            <Plus aria-hidden /> {t("addSegment")}
          </Link>
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          {t("emptyState")}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colSegment")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("colSlug")}
              </TableHead>
              <TableHead className="hidden text-right md:table-cell">
                {t("colSort")}
              </TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                {t("colOrgs")}
              </TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="w-[36px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const href = `/admin/customer-segments/${row.id}`;
              const primaryName = localizedName(locale, row.nameEn, row.nameDa);
              const description = localizedName(
                locale,
                row.descriptionEn,
                row.descriptionDa,
              );
              return (
                <TableRow
                  key={row.id}
                  className={`hover:bg-muted/50 cursor-pointer ${row.isActive ? "" : "opacity-60"}`}
                >
                  <TableCell className="p-0">
                    <Link href={href} className="block px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-medium">{primaryName}</span>
                        {description ? (
                          <span className="text-muted-foreground text-xs">
                            {description}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden p-0 font-mono text-xs sm:table-cell">
                    <Link href={href} className="block px-4 py-2.5">
                      {row.slug}
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
                        <Badge variant="success">{t("active")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("archived")}</Badge>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-right">
                    <Link
                      href={href}
                      className="text-muted-foreground block px-3 py-2.5"
                      aria-label={t("openAria", { name: primaryName })}
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
