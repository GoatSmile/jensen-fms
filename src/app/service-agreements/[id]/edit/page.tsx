import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";

import {
  ServiceAgreementForm,
  type OrgOption,
  type ServiceAgreementFormValues,
  type UnitOption,
} from "../../_components/service-agreement-form";
import { loadPickers } from "../../_lib/pickers";

export const dynamic = "force-dynamic";

export default async function EditServiceAgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tList, tCommon] = await Promise.all([
    getTranslations("serviceAgreementForm"),
    getTranslations("serviceAgreements"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();

  const [saRes, pickers] = await Promise.all([
    supabase
      .from("service_agreements")
      .select(
        `id, name_en, name_da, status, start_date, end_date, covers_parts,
         covers_labor, has_gps, monthly_fee, fee_currency, notes,
         organization_id, organization_unit_id`,
      )
      .eq("id", id)
      .maybeSingle(),
    loadPickers(supabase),
  ]);

  if (saRes.error) throw new Error(`Failed to load: ${saRes.error.message}`);
  if (!saRes.data) notFound();
  const sa = saRes.data;

  const initial: ServiceAgreementFormValues = {
    organization_id: sa.organization_id,
    organization_unit_id: sa.organization_unit_id ?? "",
    name: sa.name_da ?? sa.name_en,
    status: sa.status,
    start_date: sa.start_date ?? "",
    end_date: sa.end_date ?? "",
    covers_parts: sa.covers_parts,
    covers_labor: sa.covers_labor,
    has_gps: sa.has_gps,
    monthly_fee: sa.monthly_fee == null ? "" : String(sa.monthly_fee),
    fee_currency: sa.fee_currency ?? "DKK",
    notes: sa.notes ?? "",
  };

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
              <Link href="/service-agreements">{tList("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/service-agreements/${id}`}>
                {sa.name_da ?? sa.name_en}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbEdit")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("editTitle")}</h1>
      </div>

      <div className="max-w-3xl">
        <ServiceAgreementForm
          mode="edit"
          agreementId={id}
          initial={initial}
          organizations={pickers.organizations as OrgOption[]}
          units={pickers.units as UnitOption[]}
        />
      </div>
    </div>
  );
}
