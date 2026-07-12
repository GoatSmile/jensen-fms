import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
  SOForm,
  type ContactOption,
  type CurrencyOption,
  type OrgOption,
  type OrgUnitOption,
  type SOFormValues,
} from "../../_components/so-form";

export default async function EditSOPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tCommon] = await Promise.all([
    getTranslations("so"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();

  const { data: so, error } = await supabase
    .from("sales_orders")
    .select(
      `id, sales_order_number, status, organization_id, organization_unit_id,
       contact_id, language, order_date, requested_delivery_date,
       requested_delivery_precision, currency, notes`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load SO: ${error.message}`);
  if (!so) notFound();
  if (so.status !== "draft") {
    // Header is read-only past draft; bounce back to detail.
    redirect(`/sales-orders/${id}`);
  }

  const [orgsRes, unitsRes, contactsRes, currenciesRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, legal_name, display_name_en, display_name_da, default_vat_code, billing_currency, preferred_language",
      )
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("legal_name", { ascending: true }),
    supabase
      .from("organization_units")
      .select("id, organization_id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, organization_id, first_name, last_name, role")
      .is("deleted_at", null)
      .order("last_name", { ascending: true }),
    supabase
      .from("currencies")
      .select("code")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
  ]);

  const organizations: OrgOption[] = (orgsRes.data ?? []).map((o) => ({
    id: o.id,
    name: o.display_name_da ?? o.display_name_en ?? o.legal_name,
    default_vat_code: o.default_vat_code,
    billing_currency: o.billing_currency,
    preferred_language: o.preferred_language === "en" ? "en" : "da",
  }));
  const units: OrgUnitOption[] = unitsRes.data ?? [];
  const contacts: ContactOption[] = (contactsRes.data ?? []).map((c) => ({
    id: c.id,
    organization_id: c.organization_id,
    label:
      `${[c.first_name, c.last_name].filter(Boolean).join(" ").trim() || t("noName")}${c.role ? ` · ${c.role}` : ""}`,
  }));
  const currencies: CurrencyOption[] = currenciesRes.data ?? [];

  const initial: SOFormValues = {
    organization_id: so.organization_id,
    organization_unit_id: so.organization_unit_id ?? "",
    contact_id: so.contact_id ?? "",
    language: (so.language === "en" ? "en" : "da") as "da" | "en",
    order_date: so.order_date,
    requested_delivery_date: so.requested_delivery_date ?? "",
    requested_delivery_precision:
      so.requested_delivery_precision === "week" ? "week" : "exact",
    currency: so.currency,
    notes: so.notes ?? "",
  };

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
              <Link href="/sales-orders">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link
                href={`/sales-orders/${so.id}`}
                className="font-mono"
              >
                {so.sales_order_number}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbEdit")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold">{t("editTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("editSubtitle")}
        </p>
      </div>

      <SOForm
        mode="edit"
        soId={so.id}
        initial={initial}
        organizations={organizations}
        units={units}
        contacts={contacts}
        currencies={currencies}
      />
    </div>
  );
}
