import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
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
  POForm,
  type CurrencyOption,
  type POFormValues,
  type SupplierOption,
} from "../../_components/po-form";

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tCommon, tStatus] = await Promise.all([
    getTranslations("po"),
    getTranslations("common"),
    getTranslations("poStatus"),
  ]);
  const supabase = await createClient();

  const [poRes, suppliersRes, currenciesRes, linesCountRes] =
    await Promise.all([
      supabase
        .from("purchase_orders")
        .select(
          "id, po_number, status, supplier_id, order_date, expected_date, total_currency, notes",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("suppliers")
        .select("id, name, default_currency")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("currencies")
        .select("code, name_en")
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true }),
      supabase
        .from("purchase_order_lines")
        .select("id", { count: "exact", head: true })
        .eq("purchase_order_id", id),
    ]);

  if (poRes.error) {
    throw new Error(`Failed to load PO: ${poRes.error.message}`);
  }
  if (!poRes.data) notFound();
  if (suppliersRes.error) {
    throw new Error(
      `Failed to load suppliers: ${suppliersRes.error.message}`,
    );
  }
  if (currenciesRes.error) {
    throw new Error(
      `Failed to load currencies: ${currenciesRes.error.message}`,
    );
  }

  const po = poRes.data;

  // Sentence case throughout; this guard message also mirrors what the action
  // would return if someone POSTed to updatePO directly against a non-draft.
  if (po.status !== "draft") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/purchase-orders">{t("title")}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/purchase-orders/${id}`}>
                  <span className="font-mono">{po.po_number}</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("crumbEdit")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="rounded-md border p-6">
          <h1 className="text-lg font-semibold">{t("notEditableTitle")}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("notEditableDesc", {
              status: tStatus.has(po.status)
                ? tStatus(po.status)
                : po.status,
            })}
          </p>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link href={`/purchase-orders/${id}`}>{t("backToPo")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const suppliers: SupplierOption[] = (suppliersRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    default_currency: s.default_currency,
  }));
  const currencies: CurrencyOption[] = currenciesRes.data ?? [];

  const initial: POFormValues = {
    supplier_id: po.supplier_id,
    order_date: po.order_date ?? "",
    expected_date: po.expected_date ?? "",
    total_currency: po.total_currency ?? "DKK",
    notes: po.notes ?? "",
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/purchase-orders">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link
                href={`/purchase-orders/${id}`}
                className="font-mono"
              >
                {po.po_number}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbEdit")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("editTitle")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("editSubtitle")}
        </p>
      </div>

      <POForm
        mode="edit"
        poId={id}
        initial={initial}
        suppliers={suppliers}
        currencies={currencies}
        lockSupplier={(linesCountRes.count ?? 0) > 0}
      />
    </div>
  );
}
