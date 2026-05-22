import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
  SOForm,
  type ContactOption,
  type CurrencyOption,
  type OrgOption,
  type OrgUnitOption,
  type SOFormValues,
} from "../../_components/so-form";

export default async function EditSOPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: so, error } = await supabase
    .from("sales_orders")
    .select(
      `id, sales_order_number, status, organization_id, organization_unit_id,
       contact_id, language, order_date, requested_delivery_date, currency, notes`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load SO: ${error.message}`);
  if (!so) notFound();
  if (so.status !== "draft") {
    // Header is read-only past draft; bounce back to detail.
    redirect(`/sales-orders/${id}`);
  }

  const [orgsRes, unitsRes, contactsRes, currenciesRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, legal_name, display_name_en, display_name_da, default_vat_code",
      )
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("legal_name", { ascending: true }),
    supabase
      .from("organization_units")
      .select("id, organization_id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, organization_id, first_name, last_name, role")
      .is("deleted_at", null)
      .order("last_name", { ascending: true }),
    supabase.from("currencies").select("code").order("code"),
  ]);

  const organizations: OrgOption[] = (orgsRes.data ?? []).map((o) => ({
    id: o.id,
    name: o.display_name_da ?? o.display_name_en ?? o.legal_name,
    default_vat_code: o.default_vat_code,
  }));
  const units: OrgUnitOption[] = unitsRes.data ?? [];
  const contacts: ContactOption[] = (contactsRes.data ?? []).map((c) => ({
    id: c.id,
    organization_id: c.organization_id,
    label:
      `${[c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(no name)"}${c.role ? ` · ${c.role}` : ""}`,
  }));
  const currencies: CurrencyOption[] = currenciesRes.data ?? [];

  const initial: SOFormValues = {
    organization_id: so.organization_id,
    organization_unit_id: so.organization_unit_id ?? "",
    contact_id: so.contact_id ?? "",
    language: (so.language === "en" ? "en" : "da") as "da" | "en",
    order_date: so.order_date,
    requested_delivery_date: so.requested_delivery_date ?? "",
    currency: so.currency,
    notes: so.notes ?? "",
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
              <Link href="/sales-orders">Sales orders</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link
                href={`/sales-orders/${so.id}`}
                className="font-mono"
              >
                {so.sales_order_number}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-semibold">Edit sales order</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Header is editable while draft. Lines + status moves live on the
          detail page.
        </p>
      </div>

      <SOForm
        mode="edit"
        soId={so.id}
        initial={initial}
        organizations={organizations}
        units={units}
        contacts={contacts}
        currencies={currencies}
      />
    </div>
  );
}
