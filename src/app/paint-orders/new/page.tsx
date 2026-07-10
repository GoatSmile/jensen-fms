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
  type SupplierOption,
} from "../_components/paint-order-form";

const METACOAT_NAME = "Metacoat A/S";

export default async function NewPaintOrderPage() {
  const supabase = await createClient();

  const [suppliersRes, colorsRes] = await Promise.all([
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
  ]);

  const suppliers: SupplierOption[] = suppliersRes.data ?? [];
  const colors: ColorOption[] = colorsRes.data ?? [];

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
          One round trip with the painter. Add the item lines (what gets
          painted) and the bikes that ship with the batch on the next screen.
        </p>
      </div>
      <PaintOrderForm initial={initial} suppliers={suppliers} colors={colors} />
    </div>
  );
}
