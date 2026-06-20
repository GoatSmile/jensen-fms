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
  ColorForm,
  EMPTY_COLOR_FORM,
  type CoatingChoice,
} from "../_components/color-form";

export default async function NewColorPage() {
  const supabase = await createClient();
  const { data: coatingsData } = await supabase
    .from("coatings")
    .select("slug, label_en")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const coatings: CoatingChoice[] = (coatingsData ?? []).map((c) => ({
    slug: c.slug,
    label: c.label_en,
  }));

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
              <Link href="/admin/colors">Colours</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">New colour</h1>
        <p className="text-muted-foreground text-sm">
          Add a colour to the palette. Bike + MO pickers default to showing
          active colours.
        </p>
      </header>

      <ColorForm
        mode={{ kind: "create" }}
        initial={EMPTY_COLOR_FORM}
        coatings={coatings}
      />
    </div>
  );
}
