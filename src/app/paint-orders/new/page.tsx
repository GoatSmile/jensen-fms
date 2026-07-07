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
  EMPTY_PAINT_ORDER_FORM,
  PaintOrderForm,
  type ColorOption,
  type CurrencyOption,
  type PaintPartOption,
  type SupplierOption,
} from "../_components/paint-order-form";

const METACOAT_NAME = "Metacoat A/S";

export default async function NewPaintOrderPage() {
  const supabase = await createClient();

  // Paint parts: filter to parts whose category is "Painting Service" (was
  // "Lakering" in the old Danish-first taxonomy). We lookup the category id
  // separately so we can use a clean .eq() on parts.
  const [suppliersRes, colorsRes, currenciesRes, lakeringCategoryRes] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("colors")
        .select("id, name_en, hex, ral_code, coating")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("currencies")
        .select("code")
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true }),
      supabase
        .from("part_categories")
        .select("id")
        .eq("name_en", "Painting Service")
        .maybeSingle(),
    ]);

  let paintParts: PaintPartOption[] = [];
  if (lakeringCategoryRes.data?.id) {
    const { data } = await supabase
      .from("parts")
      .select("id, internal_sku, name_en")
      .eq("category_id", lakeringCategoryRes.data.id)
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true });
    paintParts = data ?? [];
  }

  const suppliers: SupplierOption[] = suppliersRes.data ?? [];
  const colors: ColorOption[] = colorsRes.data ?? [];
  const currencies: CurrencyOption[] = currenciesRes.data ?? [];

  // Default supplier_id: Metacoat A/S if found, otherwise blank.
  const metacoat = suppliers.find((s) => s.name === METACOAT_NAME);
  const initial = {
    ...EMPTY_PAINT_ORDER_FORM,
    supplier_id: metacoat?.id ?? "",
  };

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
              <Link href="/paint-orders">Paint orders</Link>
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
          New paint order
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          One round trip with the painter. Add the bikes that ship with this
          batch on the next screen.
        </p>
      </div>
      <PaintOrderForm
        initial={initial}
        suppliers={suppliers}
        colors={colors}
        paintParts={paintParts}
        currencies={currencies}
      />
    </div>
  );
}
