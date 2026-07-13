import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatFxRate } from "@/lib/parts/format";

import { FxActions } from "./_components/fx-actions";

export default async function FxRatesPage() {
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminFx"),
    getTranslations("common"),
  ]);

  // Latest rate per (from, to) pair — most recent rate_date wins.
  const { data: allRates } = await supabase
    .from("fx_rates")
    .select("from_currency, to_currency, rate, rate_date, source")
    .order("rate_date", { ascending: false });

  type Row = {
    from: string;
    to: string;
    rate: number;
    rateDate: string;
    source: string | null;
  };

  const latestByPair = new Map<string, Row>();
  for (const r of allRates ?? []) {
    const key = `${r.from_currency}->${r.to_currency}`;
    if (latestByPair.has(key)) continue; // already have the freshest (sorted desc)
    latestByPair.set(key, {
      from: r.from_currency,
      to: r.to_currency,
      rate: Number(r.rate),
      rateDate: r.rate_date,
      source: r.source,
    });
  }
  const rows = [...latestByPair.values()].sort((a, b) =>
    a.from.localeCompare(b.from),
  );

  const totalCount = allRates?.length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumb")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      <section className="rounded-md border">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("latestTitle")}</h2>
          <p className="text-muted-foreground text-xs">
            {t("latestDesc")}
            {totalCount > 0 ? (
              <span>
                {" "}
                {t.rich("totalRows", {
                  count: totalCount,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </span>
            ) : null}
          </p>
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
                  <TableHead>{t("colPair")}</TableHead>
                  <TableHead className="text-right">{t("colRate")}</TableHead>
                  <TableHead>{t("colAsOf")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("colSource")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.from}-${r.to}`}>
                    <TableCell className="font-mono text-xs">
                      {r.from} → {r.to}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatFxRate(r.rate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(r.rateDate)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {r.source ? (
                        <Badge variant="outline" className="font-normal">
                          {r.source}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="rounded-md border">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("actionsTitle")}</h2>
          <p className="text-muted-foreground text-xs">{t("actionsDesc")}</p>
        </header>
        <div className="p-4">
          <FxActions />
        </div>
      </section>
    </div>
  );
}
