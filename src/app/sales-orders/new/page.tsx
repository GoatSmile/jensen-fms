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
  SOForm,
  type ContactOption,
  type CurrencyOption,
  type OrgOption,
  type OrgUnitOption,
} from "../_components/so-form";

export default async function NewSOPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("so"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();
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
            <BreadcrumbPage>{t("crumbNew")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("newSubtitle")}
        </p>
      </div>

      <SOForm
        mode="create"
        organizations={organizations}
        units={units}
        contacts={contacts}
        currencies={currencies}
      />
    </div>
  );
}
