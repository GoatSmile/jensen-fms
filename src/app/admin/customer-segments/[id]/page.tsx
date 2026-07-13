import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";

import { ArchiveButton } from "../_components/archive-button";
import {
  SegmentForm,
  type SegmentFormValues,
} from "../_components/segment-form";

export default async function CustomerSegmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminSegments"),
    getTranslations("common"),
  ]);

  const [segmentRes, usageRes] = await Promise.all([
    supabase
      .from("customer_segments")
      .select(
        "id, slug, name_en, name_da, description_en, description_da, sort_order, is_active",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("customer_segment_id", id)
      .is("deleted_at", null),
  ]);

  if (segmentRes.error) {
    throw new Error(
      `Failed to load customer segment: ${segmentRes.error.message}`,
    );
  }
  if (!segmentRes.data) notFound();

  const s = segmentRes.data;
  const usageCount = usageRes.count ?? 0;

  const initial: SegmentFormValues = {
    name_en: s.name_en,
    name_da: s.name_da ?? "",
    slug: s.slug,
    description_en: s.description_en ?? "",
    description_da: s.description_da ?? "",
    sort_order: String(s.sort_order ?? 100),
    is_active: s.is_active,
  };

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
              <Link href="/admin/customer-segments">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{s.name_en}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold">{s.name_en}</h1>
          <p className="text-muted-foreground font-mono text-xs">{s.slug}</p>
        </div>
        <Badge variant={s.is_active ? "success" : "outline"}>
          {s.is_active ? t("active") : t("archived")}
        </Badge>
      </header>

      <SegmentForm mode={{ kind: "edit", id: s.id }} initial={initial} />

      <ArchiveButton
        id={s.id}
        isActive={s.is_active}
        usageCount={usageCount}
      />
    </div>
  );
}
