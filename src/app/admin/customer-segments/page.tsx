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
  SegmentsSection,
  type SegmentRow,
} from "./_components/segments-section";

export default async function AdminCustomerSegmentsPage() {
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminSegments"),
    getTranslations("common"),
  ]);

  const [segmentsRes, usageRes] = await Promise.all([
    supabase
      .from("customer_segments")
      .select(
        "id, slug, name_en, name_da, description_en, description_da, sort_order, is_active",
      )
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("organizations")
      .select("customer_segment_id")
      .not("customer_segment_id", "is", null)
      .is("deleted_at", null),
  ]);

  if (segmentsRes.error) {
    throw new Error(
      `Failed to load customer segments: ${segmentsRes.error.message}`,
    );
  }

  // Tally organisations per segment so archive warnings can show a count.
  const usageById = new Map<string, number>();
  for (const o of usageRes.data ?? []) {
    if (!o.customer_segment_id) continue;
    usageById.set(
      o.customer_segment_id,
      (usageById.get(o.customer_segment_id) ?? 0) + 1,
    );
  }

  const rows: SegmentRow[] = (segmentsRes.data ?? []).map((s) => ({
    id: s.id,
    slug: s.slug,
    nameEn: s.name_en,
    nameDa: s.name_da,
    descriptionEn: s.description_en,
    descriptionDa: s.description_da,
    sortOrder: s.sort_order,
    isActive: s.is_active,
    usageCount: usageById.get(s.id) ?? 0,
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
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </header>

      <SegmentsSection rows={rows} />
    </div>
  );
}
