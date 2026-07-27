import Link from "next/link";
import { getTranslations } from "next-intl/server";

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
  type UnitOption,
} from "../_components/service-agreement-form";
import { loadPickers } from "../_lib/pickers";

export const dynamic = "force-dynamic";

export default async function NewServiceAgreementPage() {
  const [t, tList, tCommon] = await Promise.all([
    getTranslations("serviceAgreementForm"),
    getTranslations("serviceAgreements"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();
  const { organizations, units } = await loadPickers(supabase);

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
            <BreadcrumbPage>{t("crumbNew")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("newSubtitle")}</p>
      </div>

      <div className="max-w-3xl">
        <ServiceAgreementForm
          mode="create"
          organizations={organizations as OrgOption[]}
          units={units as UnitOption[]}
        />
      </div>
    </div>
  );
}
