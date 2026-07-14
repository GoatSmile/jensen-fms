import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { ChevronRight, Plus } from "lucide-react";

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

import { MakePrimaryButton } from "./make-primary-button";

export type LocationRow = {
  id: string;
  code: string;
  nameEn: string;
  nameDa: string | null;
  address: string | null;
  isActive: boolean;
  isPrimary: boolean;
  movementCount: number;
};

/**
 * Server component list of inventory locations, mirroring the colours list.
 * Rows link to /admin/locations/[id] where edit + archive live.
 */
export async function LocationsSection({ rows }: { rows: LocationRow[] }) {
  const [t, locale] = await Promise.all([
    getTranslations("adminLocations"),
    getLocale(),
  ]);
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
          <Link href="/admin/locations/new">
            <Plus aria-hidden /> {t("addLocation")}
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
                <TableHead>{t("colCode")}</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("colAddress")}
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  {t("colMovements")}
                </TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead className="w-[120px]" />
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const href = `/admin/locations/${row.id}`;
                const primaryName = localizedName(locale, row.nameEn, row.nameDa);
                const secondaryName = locale === "da" ? row.nameEn : row.nameDa;
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
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{primaryName}</span>
                          {row.isPrimary ? (
                            <Badge variant="secondary">
                              {t("badgePrimary")}
                            </Badge>
                          ) : null}
                        </div>
                        {secondaryName && secondaryName !== primaryName ? (
                          <span className="text-muted-foreground text-xs">
                            {secondaryName}
                          </span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-xs md:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.address ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden p-0 text-right tabular-nums lg:table-cell">
                      <Link href={href} className="block px-4 py-2.5">
                        {row.movementCount}
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
                    <TableCell className="py-1.5 pr-0 pl-2 text-right">
                      {row.isActive && !row.isPrimary ? (
                        <MakePrimaryButton locationId={row.id} />
                      ) : null}
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
        </div>
      )}
    </section>
  );
}
