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
  HsCodesSection,
  type HsCodeRow,
} from "./_components/hs-codes-section";

export default async function HsCodesPage() {
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminHsCodes"),
    getTranslations("common"),
  ]);

  const [hsRes, partCountsRes] = await Promise.all([
    supabase
      .from("hs_codes")
      .select("id, code, description, tariff_pct, notes, is_active")
      .order("is_active", { ascending: false })
      .order("code", { ascending: true }),
    // How many parts reference each HS code. Used as a "be careful, this is
    // in use" hint in the row actions.
    supabase
      .from("parts")
      .select("hs_code_id")
      .not("hs_code_id", "is", null)
      .is("deleted_at", null),
  ]);

  if (hsRes.error) {
    throw new Error(`Failed to load HS codes: ${hsRes.error.message}`);
  }

  const partCounts = new Map<string, number>();
  for (const row of partCountsRes.data ?? []) {
    if (!row.hs_code_id) continue;
    partCounts.set(row.hs_code_id, (partCounts.get(row.hs_code_id) ?? 0) + 1);
  }

  const rows: HsCodeRow[] = (hsRes.data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    description: r.description,
    tariffPct: Number(r.tariff_pct),
    notes: r.notes,
    isActive: r.is_active,
    partCount: partCounts.get(r.id) ?? 0,
  }));

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
            <BreadcrumbPage>{t("crumbHsCodes")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("pageTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("pageDescription")}</p>
      </header>

      <HsCodesSection rows={rows} />
    </div>
  );
}
