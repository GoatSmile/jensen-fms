import Link from "next/link";
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
  OrganizationForm,
  type CurrencyOption,
  type OrganizationFormValues,
  type SegmentOption,
  type VatCodeOption,
} from "../../_components/organization-form";

export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [orgRes, segmentsRes, currenciesRes, vatCodesRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        `
          id, legal_name, display_name_en, display_name_da,
          customer_segment_id, preferred_language,
          cvr_number, ean_number, vat_number,
          address_line1, address_line2, zip_code, city, state_province,
          country_code, phone, email, website,
          billing_currency, payment_terms_days, default_vat_code, notes
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("customer_segments")
      .select("id, name_en")
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
      .select("code, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
  ]);

  if (orgRes.error) {
    throw new Error(`Failed to load customer: ${orgRes.error.message}`);
  }
  if (!orgRes.data) notFound();

  const o = orgRes.data;
  const initial: OrganizationFormValues = {
    legal_name: o.legal_name,
    display_name_en: o.display_name_en ?? "",
    display_name_da: o.display_name_da ?? "",
    customer_segment_id: o.customer_segment_id ?? "",
    preferred_language: o.preferred_language ?? "da",
    cvr_number: o.cvr_number ?? "",
    ean_number: o.ean_number ?? "",
    vat_number: o.vat_number ?? "",
    address_line1: o.address_line1 ?? "",
    address_line2: o.address_line2 ?? "",
    zip_code: o.zip_code ?? "",
    city: o.city ?? "",
    state_province: o.state_province ?? "",
    country_code: o.country_code ?? "DK",
    phone: o.phone ?? "",
    email: o.email ?? "",
    website: o.website ?? "",
    billing_currency: o.billing_currency ?? "DKK",
    payment_terms_days:
      o.payment_terms_days == null ? "" : String(o.payment_terms_days),
    default_vat_code: o.default_vat_code ?? "",
    notes: o.notes ?? "",
  };

  const segments: SegmentOption[] = segmentsRes.data ?? [];
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
            <BreadcrumbLink asChild>
              <Link href={`/organizations/${o.id}`}>{o.legal_name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {o.legal_name}
        </h1>
      </div>
      <OrganizationForm
        mode="edit"
        organizationId={o.id}
        initial={initial}
        segments={segments}
        currencies={currencies}
        vatCodes={vatCodes}
      />
    </div>
  );
}
