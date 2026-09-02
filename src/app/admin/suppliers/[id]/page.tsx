import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SegmentedId } from "@/components/segmented-id";
import { createClient } from "@/lib/supabase/server";
import { countryName } from "@/lib/countries";

import { ArchiveButton } from "../_components/archive-button";
import {
  SupplierForm,
  type CurrencyOption,
  type SupplierFormValues,
} from "../_components/supplier-form";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [t, tCommon] = await Promise.all([
    getTranslations("adminSuppliers"),
    getTranslations("common"),
  ]);

  const [supplierRes, offeringsRes, currenciesRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        "id, name, address_line1, address_line2, zip_code, town, province, country_code, phone, email_primary, email_secondary, website, default_currency, payment_terms_days, import_duty_prepaid_default, document_language, notes, is_active",
      )
      .eq("id", id)
      .maybeSingle(),
    // Parts this supplier offers — rendered as a linked list, plus its
    // own supplier SKU for each.
    supabase
      .from("part_supplier_offerings")
      .select(
        "supplier_sku, is_preferred, part:parts!part_id(id, internal_sku, name_en, deleted_at)",
      )
      .eq("supplier_id", id),
    supabase
      .from("currencies")
      .select("code")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
  ]);

  if (supplierRes.error) {
    throw new Error(`Failed to load supplier: ${supplierRes.error.message}`);
  }
  if (!supplierRes.data) notFound();

  const s = supplierRes.data;
  const currencies: CurrencyOption[] = currenciesRes.data ?? [];

  // Only count/show parts that aren't soft-deleted.
  const offerings = (offeringsRes.data ?? []).filter(
    (o) => o.part && o.part.deleted_at == null,
  );
  const partCount = offerings.length;

  const initial: SupplierFormValues = {
    name: s.name,
    address_line1: s.address_line1 ?? "",
    address_line2: s.address_line2 ?? "",
    zip_code: s.zip_code ?? "",
    town: s.town ?? "",
    province: s.province ?? "",
    country_code: s.country_code ?? "DK",
    phone: s.phone ?? "",
    email_primary: s.email_primary ?? "",
    email_secondary: s.email_secondary ?? "",
    website: s.website ?? "",
    default_currency: s.default_currency ?? "",
    payment_terms_days:
      s.payment_terms_days != null ? String(s.payment_terms_days) : "",
    import_duty_prepaid_default: s.import_duty_prepaid_default ?? false,
    document_language: s.document_language ?? "en",
    notes: s.notes ?? "",
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
              <Link href="/admin/suppliers">{t("crumb")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{s.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold">{s.name}</h1>
          {s.country_code ? (
            <p className="text-muted-foreground text-sm">
              {countryName(s.country_code)}
            </p>
          ) : null}
        </div>
        <Badge variant={s.is_active ? "success" : "outline"}>
          {s.is_active ? t("statusActive") : t("statusArchived")}
        </Badge>
      </header>

      <SupplierForm
        mode={{ kind: "edit", id: s.id }}
        initial={initial}
        currencies={currencies}
      />

      {/* Parts this supplier offers — each links to the part page and
          shows the supplier's own SKU for it. */}
      <section className="rounded-md border">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("partsSectionTitle")}</h2>
          <span className="text-muted-foreground text-xs">
            {t("partsCount", { count: partCount })}
          </span>
        </header>
        {partCount === 0 ? (
          <p className="text-muted-foreground p-4 text-sm italic">
            {t("partsEmpty")}
          </p>
        ) : (
          <ul className="divide-y">
            {offerings
              .slice()
              .sort((a, b) =>
                (a.part!.internal_sku ?? "").localeCompare(
                  b.part!.internal_sku ?? "",
                ),
              )
              .map((o) => (
                <li key={o.part!.id}>
                  <Link
                    href={`/parts/${o.part!.id}`}
                    className="hover:bg-muted/40 flex items-center justify-between gap-3 px-4 py-2.5 transition-colors"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5">
                        <SegmentedId
                          value={o.part!.internal_sku}
                          className="text-xs"
                        />
                        {o.is_preferred ? (
                          <span className="rounded-full bg-money-wash px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-money">
                            {t("preferred")}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground truncate text-sm">
                        {o.part!.name_en}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {o.supplier_sku ? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {o.supplier_sku}
                        </span>
                      ) : null}
                      <ChevronRight
                        className="text-muted-foreground/60 size-4"
                        aria-hidden
                      />
                    </div>
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </section>

      <ArchiveButton id={s.id} isActive={s.is_active} partCount={partCount} />
    </div>
  );
}
