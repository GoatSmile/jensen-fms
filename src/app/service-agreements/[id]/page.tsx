import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ReadField } from "@/components/field";
import { Section } from "@/components/section";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

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
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import {
  SA_STATUS_VARIANT,
  type ServiceAgreementStatus,
  isExpiringSoon,
  daysUntil,
} from "@/lib/service-agreements/status";

export const dynamic = "force-dynamic";

export default async function ServiceAgreementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tSaList, tCommon, tSaStatus, tWoStatus] = await Promise.all([
    getTranslations("serviceAgreementDetail"),
    getTranslations("serviceAgreements"),
    getTranslations("common"),
    getTranslations("saStatus"),
    getTranslations("woStatus"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();

  const { data: sa, error } = await supabase
    .from("service_agreements")
    .select(
      `id, name_en, name_da, status, start_date, end_date, covers_parts,
       covers_labor, has_gps, monthly_fee, fee_currency, notes,
       organization_id, organization_unit_id,
       organization:organizations!organization_id(legal_name, display_name_en, display_name_da),
       unit:organization_units!organization_unit_id(name)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load agreement: ${error.message}`);
  if (!sa) notFound();

  const org = Array.isArray(sa.organization) ? sa.organization[0] : sa.organization;
  const unit = Array.isArray(sa.unit) ? sa.unit[0] : sa.unit;
  const orgName =
    org?.display_name_da ?? org?.display_name_en ?? org?.legal_name ?? "—";

  // Effective coverage scope: bikes owned by the org (narrowed to the unit if
  // the agreement is unit-scoped), excluding terminal-state bikes.
  let bikesQuery = supabase
    .from("bikes")
    .select("id, frame_number, status")
    .is("deleted_at", null)
    .eq("owner_organization_id", sa.organization_id)
    .not("status", "in", "(retired,lost_or_stolen)");
  if (sa.organization_unit_id)
    bikesQuery = bikesQuery.eq("owner_unit_id", sa.organization_unit_id);
  const { data: bikes } = await bikesQuery.order("frame_number");

  const { data: workOrders } = await supabase
    .from("work_orders")
    .select("id, wo_number, status, is_billable, created_at")
    .eq("covered_by_service_agreement_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const expiring = isExpiringSoon(sa.status, sa.end_date, today);
  const days = daysUntil(sa.end_date, today);
  const coverageLabel =
    sa.covers_parts && sa.covers_labor
      ? t("coveragePartsLabour")
      : sa.covers_parts
        ? t("coveragePartsOnly")
        : sa.covers_labor
          ? t("coverageLabourOnly")
          : t("coverageNothing");

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
              <Link href="/service-agreements">{tSaList("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{sa.name_da ?? sa.name_en}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{sa.name_da ?? sa.name_en}</h1>
            <Badge
              variant={
                SA_STATUS_VARIANT[sa.status as ServiceAgreementStatus] ?? "outline"
              }
            >
              {tSaStatus.has(sa.status) ? tSaStatus(sa.status) : sa.status}
            </Badge>
            {expiring ? (
              <Badge variant="warning">
                {days === 0
                  ? tSaList("endsToday")
                  : tSaList("daysLeft", { days: days ?? 0 })}
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            {orgName}
            {unit?.name ? ` · ${unit.name}` : ` · ${t("wholeOrg")}`}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/service-agreements/${id}/edit`}>
            <Pencil aria-hidden /> {t("edit")}
          </Link>
        </Button>
      </div>

      <Section
        title={t("detailsTitle")}
        className="border-violet-200/70 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/20"
      >
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <ReadField label={t("fldCustomer")} value={orgName} />
          <ReadField
            label={t("fldUnit")}
            value={unit?.name ?? t("wholeOrgCap")}
          />
          <ReadField label={t("fldCoverage")} value={coverageLabel} />
          <ReadField label={t("fldStart")} value={sa.start_date} />
          <ReadField label={t("fldEnd")} value={sa.end_date ?? t("openEnded")} />
          <ReadField
            label={t("fldMonthlyFee")}
            value={
              sa.monthly_fee != null
                ? formatPrice(Number(sa.monthly_fee), sa.fee_currency ?? "DKK")
                : null
            }
          />
          <ReadField
            label={t("fldGpsAddon")}
            value={sa.has_gps ? t("yes") : t("no")}
          />
        </dl>
        {sa.notes ? (
          <div className="mt-4">
            <ReadField label={t("fldNotes")} value={sa.notes} multiline />
          </div>
        ) : null}
      </Section>

      <Section
        title={t("bikesInScope", { count: bikes?.length ?? 0 })}
        description={
          sa.organization_unit_id
            ? t("bikesDescUnit")
            : t("bikesDescOrg")
        }
        className="border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20"
      >
        {!bikes || bikes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {sa.organization_unit_id
              ? t("bikesEmptyUnit")
              : t("bikesEmptyOrg")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {bikes.map((b) => (
              <Link
                key={b.id}
                href={`/bikes/${b.id}`}
                className="bg-background hover:bg-muted rounded-md border px-2 py-1 font-mono text-xs"
              >
                {b.frame_number}
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={t("coveredWos", { count: workOrders?.length ?? 0 })}
        description={t("coveredWosDesc")}
        className="border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20"
      >
        {!workOrders || workOrders.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noWos")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {workOrders.map((wo) => (
              <li key={wo.id}>
                <Link
                  href={`/maintenance/work-orders/${wo.id}`}
                  className="hover:underline"
                >
                  {wo.wo_number}
                </Link>{" "}
                <span className="text-muted-foreground">
                  ·{" "}
                  {tWoStatus.has(wo.status) ? tWoStatus(wo.status) : wo.status} ·{" "}
                  {wo.is_billable ? t("woBillable") : t("woCovered")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

