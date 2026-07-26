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
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

import {
  SuppliersSection,
  type SupplierRow,
} from "./_components/suppliers-section";

export default async function AdminSuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ gap?: string }>;
}) {
  const gap = (await searchParams).gap === "email";
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminSuppliers"),
    getTranslations("common"),
  ]);

  const [suppliersRes, offeringsRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, country_code, default_currency, is_active, email_primary")
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

  const allRows: SupplierRow[] = (suppliersRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    countryCode: s.country_code,
    defaultCurrency: s.default_currency,
    isActive: s.is_active,
    partCount: partsBySupplier.get(s.id) ?? 0,
    emailPrimary: s.email_primary ?? null,
  }));

  // Housekeeping drill-down from the dashboard: active suppliers with no
  // primary email (same predicate as loadHousekeeping).
  const rows = gap
    ? allRows.filter((r) => r.isActive && !r.emailPrimary?.trim())
    : allRows;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
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
            <BreadcrumbPage>{t("crumb")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </header>

      {gap ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-buy-wash px-4 py-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">
              {t("gapTitle", { count: rows.length })}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("gapDesc")}
            </span>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/suppliers">{t("clearFilter")}</Link>
          </Button>
        </div>
      ) : null}

      <SuppliersSection rows={rows} />
    </div>
  );
}
