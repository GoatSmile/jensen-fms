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
  EMPTY_MO_FORM,
  MOForm,
  ONE_OFF_VALUE,
  type BikeTypeOption,
  type ColorOption,
  type TemplateOption,
} from "../_components/mo-form";
import { MOBatchForm } from "../_components/mo-batch-form";

type SearchParams = {
  template?: string;
  /** "oneoff" switches to the single-MO form for template-less builds. */
  mode?: string;
};

export default async function NewManufacturingOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [templatesRes, bikeTypesRes, colorsRes] = await Promise.all([
    supabase
      .from("bike_templates")
      .select(
        `
          id, name_en, family, frame_size, version, is_current, bike_type_id,
          bike_type:bike_types(name_en)
        `,
      )
      .eq("is_current", true)
      .order("family", { ascending: true, nullsFirst: false })
      .order("frame_size", { ascending: true })
      .order("name_en", { ascending: true }),
    supabase
      .from("bike_types")
      .select("id, slug, name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("colors")
      .select("id, slug, name_da, name_en, hex")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (templatesRes.error) {
    throw new Error(`Failed to load templates: ${templatesRes.error.message}`);
  }

  const templates: TemplateOption[] = (templatesRes.data ?? []).map((t) => ({
    id: t.id,
    name_en: t.name_en,
    family: t.family,
    frame_size: t.frame_size,
    version: t.version,
    is_current: t.is_current,
    bike_type_id: t.bike_type_id,
    bike_type_name: t.bike_type?.name_en ?? null,
  }));
  const typeRows = bikeTypesRes.data ?? [];
  const bikeTypes: BikeTypeOption[] = typeRows.map(({ id, name_en }) => ({
    id,
    name_en,
  }));
  const defaultBikeTypeId =
    typeRows.find((t) => t.slug === "e_bike")?.id ?? "";
  const colors: ColorOption[] = colorsRes.data ?? [];
  const isOneOff = sp.mode === "oneoff";

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
              <Link href="/manufacturing-orders">Manufacturing orders</Link>
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
          {isOneOff ? "New one-off build" : "New manufacturing orders"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isOneOff ? (
            <>
              No template — you assemble the parts list by hand on the next
              screen.{" "}
              <Link
                href="/manufacturing-orders/new"
                className="hover:text-foreground underline underline-offset-4"
              >
                Back to batch creation
              </Link>
            </>
          ) : (
            "Build the batch row by row — each row becomes one MO with its parts list seeded from the template, and the bikes can be created in the same go."
          )}
        </p>
      </div>
      {isOneOff ? (
        <MOForm
          initial={{
            ...EMPTY_MO_FORM,
            bike_template_id: ONE_OFF_VALUE,
            bike_type_id: defaultBikeTypeId,
          }}
          templates={templates}
          bikeTypes={bikeTypes}
          colors={colors}
        />
      ) : (
        <MOBatchForm
          templates={templates}
          colors={colors}
          initialTemplateId={sp.template}
        />
      )}
    </div>
  );
}
