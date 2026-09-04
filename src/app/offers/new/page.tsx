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
  OfferForm,
  type ContactOption,
  type CurrencyOption,
  type OrgOption,
  type OrgUnitOption,
} from "../_components/offer-form";
import { loadOfferFormOptions } from "../_components/load-options";

export default async function NewOfferPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("offers"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();
  const { organizations, units, contacts, currencies } =
    await loadOfferFormOptions(supabase, t("noName"));

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
              <Link href="/offers">{t("title")}</Link>
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
        <p className="text-muted-foreground mt-1 text-sm">{t("newSubtitle")}</p>
      </div>

      <OfferForm
        mode="create"
        organizations={organizations satisfies OrgOption[]}
        units={units satisfies OrgUnitOption[]}
        contacts={contacts satisfies ContactOption[]}
        currencies={currencies satisfies CurrencyOption[]}
      />
    </div>
  );
}
