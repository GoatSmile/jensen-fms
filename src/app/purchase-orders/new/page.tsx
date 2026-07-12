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
  POForm,
  type CurrencyOption,
  type POFormValues,
  type SupplierOption,
} from "../_components/po-form";

/**
 * Inline default instead of importing a factory from po-form.tsx — that
 * file is a "use client" boundary and Next.js refuses to call functions
 * exported from it from a server component (types are still fine).
 */
function emptyPOForm(): POFormValues {
  return {
    supplier_id: "",
    order_date: new Date().toISOString().slice(0, 10),
    expected_date: "",
    total_currency: "DKK",
    notes: "",
  };
}

export default async function NewPurchaseOrderPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations("po"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();

  const [suppliersRes, currenciesRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, default_currency")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("currencies")
      .select("code, name_en")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
  ]);

  if (suppliersRes.error) {
    throw new Error(
      `Failed to load suppliers: ${suppliersRes.error.message}`,
    );
  }
  if (currenciesRes.error) {
    throw new Error(
      `Failed to load currencies: ${currenciesRes.error.message}`,
    );
  }

  const suppliers: SupplierOption[] = (suppliersRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    default_currency: s.default_currency,
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
              <Link href="/purchase-orders">{t("title")}</Link>
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
        <p className="text-muted-foreground mt-1 text-sm">{t("newSubtitle")}</p>
      </div>

      <POForm
        mode="create"
        initial={emptyPOForm()}
        suppliers={suppliers}
        currencies={currencies}
      />
    </div>
  );
}
