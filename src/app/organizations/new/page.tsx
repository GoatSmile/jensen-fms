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
  EMPTY_ORGANIZATION_SHELL,
  OrganizationForm,
  type CurrencyOption,
  type SegmentOption,
  type VatCodeOption,
} from "../_components/organization-form";

export default async function NewOrganizationPage() {
  const [t, tCustomers, tCommon] = await Promise.all([
    getTranslations("customerForm"),
    getTranslations("customers"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();

  const [segmentsRes, currenciesRes, vatCodesRes] = await Promise.all([
    supabase
      .from("customer_segments")
      .select("id, slug, name_en, name_da")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("currencies")
      .select("code")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
    supabase
      .from("vat_codes")
      .select("code, name_en, name_da")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
  ]);

  const segmentRows = segmentsRes.data ?? [];
  const segments: SegmentOption[] = segmentRows.map(
    ({ id, name_en, name_da }) => ({
      id,
      name_en,
      name_da,
    }),
  );
  const defaultSegmentId =
    segmentRows.find((s) => s.slug === "hotel")?.id ?? "";
  const currencies: CurrencyOption[] = currenciesRes.data ?? [];
  const vatCodes: VatCodeOption[] = vatCodesRes.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/organizations">{tCustomers("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbNew")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("newTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("newSubtitle")}</p>
      </div>
      <OrganizationForm
        mode="create"
        initial={{
          ...EMPTY_ORGANIZATION_SHELL,
          customer_segment_id: defaultSegmentId,
        }}
        segments={segments}
        currencies={currencies}
        vatCodes={vatCodes}
      />
    </div>
  );
}
