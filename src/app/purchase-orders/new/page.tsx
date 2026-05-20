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
  emptyPOForm,
  POForm,
  type CurrencyOption,
  type SupplierOption,
} from "../_components/po-form";

export default async function NewPurchaseOrderPage() {
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
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/purchase-orders">Purchase orders</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New purchase order
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Create the header now; add lines on the next screen. The PO stays in
          draft until you move it to placed.
        </p>
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
