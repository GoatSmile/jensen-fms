import Link from "next/link";
import { notFound } from "next/navigation";

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
  EMPTY_VARIANT_FORM,
  VariantForm,
} from "../../_components/variant-form";

export default async function NewVariantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [modelRes, currenciesRes] = await Promise.all([
    supabase
      .from("bike_models")
      .select("id, name_en")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("currencies").select("code, name_en").order("code"),
  ]);

  if (modelRes.error) {
    throw new Error(`Failed to load model: ${modelRes.error.message}`);
  }
  if (!modelRes.data) notFound();

  const m = modelRes.data;

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
              <Link href="/bike-models">Bike models</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/bike-models/${m.id}`}>{m.name_en}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New variant</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New variant
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          for <span className="font-medium">{m.name_en}</span>
        </p>
      </div>
      <VariantForm
        mode="create"
        modelId={m.id}
        initial={EMPTY_VARIANT_FORM}
        currencies={currenciesRes.data ?? []}
      />
    </div>
  );
}
