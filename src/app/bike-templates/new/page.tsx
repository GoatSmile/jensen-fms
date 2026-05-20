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
  EMPTY_TEMPLATE_SHELL,
  TemplateForm,
  type BikeTypeOption,
  type CurrencyOption,
} from "../_components/template-form";

export default async function NewBikeTemplatePage() {
  const supabase = await createClient();

  const [typesRes, currenciesRes] = await Promise.all([
    supabase
      .from("bike_types")
      .select("id, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("currencies")
      .select("code, symbol")
      .order("code", { ascending: true }),
  ]);

  const bikeTypes: BikeTypeOption[] = typesRes.data ?? [];
  const currencies: CurrencyOption[] = currenciesRes.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
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
              <Link href="/bike-templates">Bike templates</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New template</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Add the parts recipe after the template shell is created.
        </p>
      </div>
      <TemplateForm
        mode="create"
        initial={EMPTY_TEMPLATE_SHELL}
        bikeTypes={bikeTypes}
        currencies={currencies}
      />
    </div>
  );
}
