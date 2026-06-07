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
  SuppliersSection,
  type SupplierRow,
} from "./_components/suppliers-section";

export default async function AdminSuppliersPage() {
  const supabase = await createClient();

  const [suppliersRes, offeringsRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, country_code, default_currency, is_active")
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true }),
    supabase.from("part_supplier_offerings").select("supplier_id"),
  ]);

  if (suppliersRes.error) {
    throw new Error(`Failed to load suppliers: ${suppliersRes.error.message}`);
  }

  // Tally how many part offerings each supplier appears in.
  const partsBySupplier = new Map<string, number>();
  for (const o of offeringsRes.data ?? []) {
    if (!o.supplier_id) continue;
    partsBySupplier.set(
      o.supplier_id,
      (partsBySupplier.get(o.supplier_id) ?? 0) + 1,
    );
  }

  const rows: SupplierRow[] = (suppliersRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    countryCode: s.country_code,
    defaultCurrency: s.default_currency,
    isActive: s.is_active,
    partCount: partsBySupplier.get(s.id) ?? 0,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
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
            <BreadcrumbPage>Suppliers</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Suppliers</h1>
        <p className="text-muted-foreground text-sm">
          The vendors parts are bought from. Used by part offerings,
          purchase orders, and paint orders. Archived suppliers stay on
          historical records but drop out of new pickers.
        </p>
      </header>

      <SuppliersSection rows={rows} />
    </div>
  );
}
