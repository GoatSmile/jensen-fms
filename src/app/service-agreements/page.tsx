import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, ShieldCheck } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  SA_STATUS_VARIANT,
  type ServiceAgreementStatus,
  isExpiringSoon,
  daysUntil,
} from "@/lib/service-agreements/status";

export const dynamic = "force-dynamic";

const FILTER_IDS = ["all", "active", "expired", "cancelled"] as const;

export default async function ServiceAgreementsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [t, tCommon, tSaStatus] = await Promise.all([
    getTranslations("serviceAgreements"),
    getTranslations("common"),
    getTranslations("saStatus"),
  ]);
  const { status } = await searchParams;
  const filter = FILTER_IDS.some((id) => id === status) ? status! : "all";
  const filterLabel = (id: string) =>
    id === "all" ? t("filterAll") : tSaStatus(id);
  const today = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  let query = supabase
    .from("service_agreements")
    .select(
      `id, name_en, name_da, status, start_date, end_date, monthly_fee,
       fee_currency, has_gps,
       organization:organizations!organization_id(legal_name, display_name_en, display_name_da),
       unit:organization_units!organization_unit_id(name)`,
    )
    .order("start_date", { ascending: false });
  if (filter !== "all")
    query = query.eq("status", filter as ServiceAgreementStatus);

  const { data: rows, error } = await query;
  if (error) throw new Error(`Failed to load agreements: ${error.message}`);

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
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/service-agreements/new">
            <Plus aria-hidden /> {t("newAgreement")}
          </Link>
        </Button>
      </div>

      <div className="flex gap-1.5">
        {FILTER_IDS.map((id) => (
          <Button
            key={id}
            asChild
            size="sm"
            variant={filter === id ? "default" : "outline"}
          >
            <Link href={id === "all" ? "/service-agreements" : `?status=${id}`}>
              {filterLabel(id)}
            </Link>
          </Button>
        ))}
      </div>

      {!rows || rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
          action={{ label: t("newAgreement"), href: "/service-agreements/new" }}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thAgreement")}</TableHead>
                <TableHead>{t("thCustomer")}</TableHead>
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("thPeriod")}</TableHead>
                <TableHead className="text-right">{t("thMonthlyFee")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((sa) => {
                const org = Array.isArray(sa.organization)
                  ? sa.organization[0]
                  : sa.organization;
                const unit = Array.isArray(sa.unit) ? sa.unit[0] : sa.unit;
                const customer = [
                  org?.display_name_da ?? org?.display_name_en ?? org?.legal_name,
                  unit?.name,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const expiring = isExpiringSoon(sa.status, sa.end_date, today);
                const days = daysUntil(sa.end_date, today);
                const href = `/service-agreements/${sa.id}`;
                return (
                  <TableRow key={sa.id} className="hover:bg-muted/50">
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5 text-sm font-medium hover:underline">
                        {sa.name_da ?? sa.name_en}
                        {sa.has_gps ? (
                          <span className="text-muted-foreground ml-2 text-xs">
                            {t("gpsSuffix")}
                          </span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={href} className="block px-4 py-2.5 text-sm hover:underline">
                        {customer || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={
                            SA_STATUS_VARIANT[sa.status as ServiceAgreementStatus] ??
                            "outline"
                          }
                        >
                          {tSaStatus.has(sa.status)
                            ? tSaStatus(sa.status)
                            : sa.status}
                        </Badge>
                        {expiring ? (
                          <Badge variant="warning">
                            {days === 0
                              ? t("endsToday")
                              : t("daysLeft", { days: days ?? 0 })}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "hidden text-sm md:table-cell",
                        expiring && "text-foreground",
                      )}
                    >
                      {sa.start_date}
                      {" – "}
                      {sa.end_date ?? t("periodOpen")}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {sa.monthly_fee != null
                        ? formatPrice(Number(sa.monthly_fee), sa.fee_currency ?? "DKK")
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
