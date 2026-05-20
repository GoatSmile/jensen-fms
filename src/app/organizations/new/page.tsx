import Link from "next/link";

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
  const supabase = await createClient();

  const [segmentsRes, currenciesRes, vatCodesRes] = await Promise.all([
    supabase
      .from("customer_segments")
      .select("id, slug, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("currencies")
      .select("code")
      .order("code", { ascending: true }),
    supabase
      .from("vat_codes")
      .select("code, name_en")
      .eq("is_active", true)
      .order("code", { ascending: true }),
  ]);

  const segmentRows = segmentsRes.data ?? [];
  const segments: SegmentOption[] = segmentRows.map(({ id, name_en }) => ({
    id,
    name_en,
  }));
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
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/organizations">Customers</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New customer</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Capture the basics now — billing and contact details can be filled in
          later from the edit screen.
        </p>
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
