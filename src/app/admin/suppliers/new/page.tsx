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
  EMPTY_SUPPLIER_FORM,
  SupplierForm,
  type CurrencyOption,
} from "../_components/supplier-form";

export default async function NewSupplierPage() {
  const supabase = await createClient();
  const { data: currenciesData } = await supabase
    .from("currencies")
    .select("code")
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  const currencies: CurrencyOption[] = currenciesData ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/admin">Admin</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin/suppliers">Suppliers</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">New supplier</h1>
        <p className="text-muted-foreground text-sm">
          Add a vendor. Once saved, it becomes selectable when adding a
          part offering, a purchase order, or a paint order.
        </p>
      </header>

      <SupplierForm
        mode={{ kind: "create" }}
        initial={EMPTY_SUPPLIER_FORM}
        currencies={currencies}
      />
    </div>
  );
}
