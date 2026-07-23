import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { localizedName } from "@/i18n/vocab";
import { createClient } from "@/lib/supabase/server";

import { EMPTY_PERSON_FORM, PersonForm } from "../_components/person-form";

export default async function NewPersonPage() {
  const supabase = await createClient();
  const [t, locale] = await Promise.all([
    getTranslations("adminPeople"),
    getLocale(),
  ]);

  const { data: roles, error } = await supabase
    .from("roles")
    .select("id, name_en, name_da")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to load roles: ${error.message}`);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/people">{t("crumb")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbNew")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("newPerson")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("personNewSubtitle")}
        </p>
      </div>

      <PersonForm
        mode={{ kind: "create" }}
        initial={EMPTY_PERSON_FORM}
        roleOptions={(roles ?? []).map((r) => ({
          id: r.id,
          label: localizedName(locale, r.name_en, r.name_da),
        }))}
      />
    </div>
  );
}
