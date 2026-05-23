import Link from "next/link";
import { notFound } from "next/navigation";

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
  HsCodeForm,
  type HsCodeFormValues,
} from "../_components/hs-code-form";

export default async function HsCodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [codeRes, partUsageRes] = await Promise.all([
    supabase
      .from("hs_codes")
      .select("id, code, description, tariff_pct, notes, is_active")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("parts")
      .select("id", { count: "exact", head: true })
      .eq("hs_code_id", id)
      .is("deleted_at", null),
  ]);

  if (codeRes.error) {
    throw new Error(`Failed to load HS code: ${codeRes.error.message}`);
  }
  if (!codeRes.data) notFound();

  const c = codeRes.data;
  const partCount = partUsageRes.count ?? 0;

  // Form stores the human-readable percent (e.g. "5.2"), DB stores the
  // decimal (0.052). Convert once on the way in.
  const tariffAsPercent = String(
    Math.round(Number(c.tariff_pct) * 10000) / 100,
  );

  const initial: HsCodeFormValues = {
    code: c.code,
    description: c.description,
    tariff: tariffAsPercent,
    notes: c.notes ?? "",
    is_active: c.is_active,
  };

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
              <Link href="/admin/hs-codes">HS / TARIC codes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{c.code}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-mono text-2xl font-semibold">{c.code}</h1>
          <p className="text-muted-foreground text-sm">{c.description}</p>
        </div>
        <Badge variant={c.is_active ? "success" : "outline"}>
          {c.is_active ? "Active" : "Archived"}
        </Badge>
      </header>

      <HsCodeForm mode={{ kind: "edit", id: c.id }} initial={initial} />

      <ArchiveButton
        id={c.id}
        isActive={c.is_active}
        partCount={partCount}
      />
    </div>
  );
}
