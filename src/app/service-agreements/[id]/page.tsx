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
import { UploadAgreementButton } from "@/components/agreements/upload-agreement-button";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { formatDate } from "@/lib/parts/format";
import { readHasCapability } from "@/lib/auth/read-session";

import {
  AgreementBikesPanel,
  type CandidateBike,
  type LineView,
} from "./_components/agreement-bikes-panel";
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
  const [t, tSaList, tCommon, tSaStatus, tWoStatus, tDocs] = await Promise.all([
    getTranslations("serviceAgreementDetail"),
    getTranslations("serviceAgreements"),
    getTranslations("common"),
    getTranslations("saStatus"),
    getTranslations("woStatus"),
    getTranslations("agreementDocs"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();

  const { data: sa, error } = await supabase
    .from("service_agreements")
    .select(
      `id, name_en, name_da, status, start_date, end_date, covers_parts,
       covers_labor, has_gps, monthly_fee, fee_currency, notes,
       contract_type, signed_on, signatories,
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

  // The lines ARE the coverage (migration 110): active and ended, each with
  // its bike. Candidates for *Add bikes* are the customer's live bikes that
  // are not already on this agreement.
  const [linesRes, orgBikesRes, docsRes, canEdit] = await Promise.all([
    supabase
      .from("service_agreement_bikes")
      .select(
        "id, bike_id, start_date, yearly_price, currency, has_gps, status, end_reason, ended_on, source, bike:bikes!bike_id(frame_number)",
      )
      .eq("agreement_id", id)
      .order("status")
      .order("start_date"),
    supabase
      .from("bikes")
      .select("id, frame_number, unit:organization_units!owner_unit_id(name)")
      .is("deleted_at", null)
      .eq("owner_organization_id", sa.organization_id)
      .not("status", "in", "(retired,lost_or_stolen)")
      .order("frame_number"),
    supabase
      .from("service_agreement_documents")
      .select("id, status, created_at, confirmed_at")
      .eq("agreement_id", id)
      .order("created_at", { ascending: false }),
    readHasCapability("agreements"),
  ]);
  const lines: LineView[] = (linesRes.data ?? []).map((l) => {
    const b = Array.isArray(l.bike) ? l.bike[0] : l.bike;
    return {
      id: l.id,
      bikeId: l.bike_id,
      frameNumber: b?.frame_number ?? "—",
      startDate: l.start_date,
      yearlyPrice: l.yearly_price == null ? null : Number(l.yearly_price),
      currency: l.currency,
      hasGps: l.has_gps,
      status: l.status as "active" | "ended",
      endReason: l.end_reason,
      endedOn: l.ended_on,
      source: l.source,
    };
  });
  const onThis = new Set(lines.filter((l) => l.status === "active").map((l) => l.bikeId));
  const orgBikes = (orgBikesRes.data ?? []).filter((b) => !onThis.has(b.id));
  const { data: elsewhere } = orgBikes.length
    ? await supabase
        .from("service_agreement_bikes")
        .select("bike_id, agreement:service_agreements!agreement_id(name_en, name_da)")
        .eq("status", "active")
        .in("bike_id", orgBikes.map((b) => b.id))
    : { data: [] };
  const elsewhereByBike = new Map(
    (elsewhere ?? []).map((e) => {
      const a = Array.isArray(e.agreement) ? e.agreement[0] : e.agreement;
      return [e.bike_id, a ? (a.name_da ?? a.name_en) : "—"];
    }),
  );
  const candidates: CandidateBike[] = orgBikes.map((b) => {
    const unitRow = Array.isArray(b.unit) ? b.unit[0] : b.unit;
    return {
      id: b.id,
      frameNumber: b.frame_number,
      unitName: unitRow?.name ?? null,
      onAgreement: elsewhereByBike.get(b.id) ?? null,
    };
  });
  const docs = docsRes.data ?? [];

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
        hue="system"
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
          <ReadField label={tDocs("fldContractType")} value={sa.contract_type ?? tDocs("noContractType")} />
          <ReadField
            label={tDocs("fldSignedOn")}
            value={sa.signed_on ? formatDate(sa.signed_on) : tDocs("verbal")}
          />
          <ReadField label={tDocs("fldSignatories")} value={sa.signatories} />
        </dl>
        {sa.notes ? (
          <div className="mt-4">
            <ReadField label={t("fldNotes")} value={sa.notes} multiline />
          </div>
        ) : null}
      </Section>

      <AgreementBikesPanel
        agreementId={id}
        lines={lines}
        candidates={candidates}
        defaultStartDate={sa.start_date}
        canEdit={canEdit}
      />

      <Section
        title={tDocs("agreementDocsTitle", { count: docs.length })}
        description={tDocs("agreementDocsDesc")}
        action={
          canEdit ? (
            <UploadAgreementButton organizationId={sa.organization_id} agreementId={id} />
          ) : null
        }
      >
        {docs.length === 0 ? (
          <p className="bg-ground text-muted-foreground rounded-lg p-4 text-sm">{tDocs("agreementDocsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/service-agreements/documents/${d.id}`} className="hover:underline">
                  {tDocs("docUploaded", { date: formatDate(d.created_at.slice(0, 10)) })}
                </Link>
                <Badge
                  variant={
                    d.status === "confirmed" ? "success" : d.status === "failed" ? "destructive" : "warning"
                  }
                >
                  {tDocs(`docStatus.${d.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t("coveredWos", { count: workOrders?.length ?? 0 })}
        description={t("coveredWosDesc")}
        hue="brand"
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

