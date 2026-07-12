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

import { EMPTY_PART_FORM, PartForm } from "../_components/part-form";

export default async function NewPartPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("parts"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();
  const [categoriesRes, currenciesRes, hsCodesRes, suppliersRes] =
    await Promise.all([
      supabase
        .from("part_categories")
        .select("id, name_en, parent_id")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true }),
      supabase
        .from("currencies")
        .select("code, name_en")
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true }),
      supabase
        .from("hs_codes")
        .select("id, code, description, tariff_pct")
        .eq("is_active", true)
        // hs_codes has no sort_order column — ordering by it errored the
        // query and silently emptied the picker. Order by code.
        .order("code", { ascending: true }),
      supabase
        .from("suppliers")
        .select("id, name")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

  const hsCodes = (hsCodesRes.data ?? []).map((h) => ({
    id: h.id,
    code: h.code,
    description: h.description,
    tariffPct: Number(h.tariff_pct),
  }));

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
              <Link href="/parts">{t("title")}</Link>
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
          {t("newPart")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("newSubtitle")}
        </p>
      </div>

      <PartForm
        mode="create"
        initial={EMPTY_PART_FORM}
        categories={categoriesRes.data ?? []}
        currencies={currenciesRes.data ?? []}
        hsCodes={hsCodes}
        suppliers={suppliersRes.data ?? []}
      />
    </div>
  );
}
