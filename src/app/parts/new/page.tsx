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

import { EMPTY_PART_FORM, PartForm } from "../_components/part-form";

export default async function NewPartPage() {
  const supabase = await createClient();
  const [categoriesRes, currenciesRes, hsCodesRes] = await Promise.all([
    supabase
      .from("part_categories")
      .select("id, name_en, parent_id")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase.from("currencies").select("code, name_en").order("code"),
    supabase
      .from("hs_codes")
      .select("id, code, description, tariff_pct")
      .eq("is_active", true)
      .order("code", { ascending: true }),
  ]);

  const hsCodes = (hsCodesRes.data ?? []).map((h) => ({
    id: h.id,
    code: h.code,
    description: h.description,
    tariffPct: Number(h.tariff_pct),
  }));

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
              <Link href="/parts">Parts</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New part</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Add suppliers and photos after the part is created.
        </p>
      </div>

      <PartForm
        mode="create"
        initial={EMPTY_PART_FORM}
        categories={categoriesRes.data ?? []}
        currencies={currenciesRes.data ?? []}
        hsCodes={hsCodes}
      />
    </div>
  );
}
