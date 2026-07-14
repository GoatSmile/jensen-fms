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
  PAINT_SERVICE_SLUG,
  loadServiceTypeBySlug,
} from "@/lib/services/vocab";

import {
  EMPTY_PAINT_ORDER_FORM,
  PaintOrderForm,
  type ColorOption,
  type SupplierOption,
} from "../_components/paint-order-form";

export default async function NewPaintOrderPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("paintOrders"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();

  const [suppliersRes, colorsRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("colors")
      .select("id, name_en, name_da, hex, ral_code, coating")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const suppliers: SupplierOption[] = suppliersRes.data ?? [];
  const colors: ColorOption[] = colorsRes.data ?? [];

  // Pre-select the painting type's configured default supplier — but only if
  // it's still an active supplier (an archived default shouldn't preselect a
  // row that isn't in the picker).
  const serviceType = await loadServiceTypeBySlug(supabase, PAINT_SERVICE_SLUG);
  const defaultSupplierId =
    serviceType?.default_supplier_id &&
    suppliers.some((s) => s.id === serviceType.default_supplier_id)
      ? serviceType.default_supplier_id
      : "";
  const initial = {
    ...EMPTY_PAINT_ORDER_FORM,
    supplier_id: defaultSupplierId,
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
              <Link href="/paint-orders">{t("title")}</Link>
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
          {t("newTitle")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("newSubtitle")}
        </p>
      </div>
      <PaintOrderForm initial={initial} suppliers={suppliers} colors={colors} />
    </div>
  );
}
