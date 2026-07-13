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
  CategoryForm,
  EMPTY_CATEGORY_FORM,
} from "../_components/category-form";
import { buildParentOptions, type CategoryInput } from "../_lib/tree";

export default async function NewCategoryPage() {
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminCategories"),
    getTranslations("common"),
  ]);
  const { data } = await supabase
    .from("part_categories")
    .select("id, name_en, name_da, parent_id, is_active, sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  const parentOptions = buildParentOptions((data ?? []) as CategoryInput[]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/categories">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbNew")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("newDescription")}</p>
      </header>

      <CategoryForm
        mode={{ kind: "create" }}
        initial={EMPTY_CATEGORY_FORM}
        parentOptions={parentOptions}
      />
    </div>
  );
}
