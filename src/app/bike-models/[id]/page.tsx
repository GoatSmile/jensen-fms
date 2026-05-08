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
import { formatMoney } from "@/lib/parts/format";

import { BikeModelHeader } from "./_components/bike-model-header";
import { EmptyRow, Section } from "./_components/section";
import {
  TemplatesSection,
  type TemplateSummary,
} from "./_components/templates-section";
import {
  VariantsSection,
  type VariantRow,
} from "./_components/variants-section";

export default async function BikeModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    modelRes,
    variantsRes,
    templatesRes,
    templatePartCountsRes,
    bikeCountRes,
  ] = await Promise.all([
      supabase
        .from("bike_models")
        .select(
          `
            id,
            name_en,
            name_da,
            description_en,
            description_da,
            manufacturer,
            model_year,
            headline_retail_price,
            headline_currency,
            frame_number_code,
            deleted_at,
            bike_type:bike_types(id, name_en)
          `,
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("bike_model_variants")
        .select(
          "id, sku, name_en, name_da, frame_size, color_en, retail_price, retail_currency, is_active",
        )
        .eq("bike_model_id", id)
        .order("is_active", { ascending: false })
        .order("sku", { ascending: true }),
      supabase
        .from("bike_templates")
        .select(
          "id, name_en, version, is_current, bike_model_variant:bike_model_variants(name_en)",
        )
        .eq("bike_model_id", id)
        .order("is_current", { ascending: false })
        .order("version", { ascending: false }),
      supabase.from("bike_template_parts").select("template_id"),
      supabase
        .from("bikes")
        .select(
          "id, frame_number, status, bike_model_variant:bike_model_variants(name_en)",
        )
        .eq("bike_model_id", id)
        .is("deleted_at", null)
        .order("frame_number", { ascending: true })
        .limit(20),
    ]);

  if (modelRes.error) {
    throw new Error(`Failed to load model: ${modelRes.error.message}`);
  }
  if (!modelRes.data) notFound();

  const m = modelRes.data;
  const variantRows: VariantRow[] = (variantsRes.data ?? []).map((v) => ({
    id: v.id,
    sku: v.sku,
    nameEn: v.name_en,
    nameDa: v.name_da,
    frameSize: v.frame_size,
    colorEn: v.color_en,
    retailPrice: v.retail_price != null ? Number(v.retail_price) : null,
    retailCurrency: v.retail_currency,
    isActive: v.is_active,
  }));
  const variantCount = variantRows.length;
  const templatePartCounts = new Map<string, number>();
  for (const row of templatePartCountsRes.data ?? []) {
    templatePartCounts.set(
      row.template_id,
      (templatePartCounts.get(row.template_id) ?? 0) + 1,
    );
  }
  const templateRows: TemplateSummary[] = (templatesRes.data ?? []).map((t) => ({
    id: t.id,
    name_en: t.name_en,
    variant_name: t.bike_model_variant?.name_en ?? null,
    version: t.version,
    is_current: t.is_current,
    part_count: templatePartCounts.get(t.id) ?? 0,
  }));
  const currentTemplateCount = templateRows.filter((t) => t.is_current).length;
  const bikeRows = bikeCountRes.data ?? [];
  const bikeCount = bikeRows.length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
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
            <BreadcrumbPage>{m.name_en}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <BikeModelHeader
        modelId={m.id}
        nameEn={m.name_en}
        nameDa={m.name_da}
        bikeTypeName={m.bike_type?.name_en ?? null}
        manufacturer={m.manufacturer}
        modelYear={m.model_year}
        isDeleted={m.deleted_at != null}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Variants" value={String(variantCount)} hint="size + colour combinations" />
        <Stat label="Current templates" value={String(currentTemplateCount)} hint="active recipes" />
        <Stat label="Bikes built" value={String(bikeCount)} hint="against this model" />
      </div>

      <Section
        title="Details"
        description="Catalog metadata that flows to offers, sales orders, and invoices."
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Description (English)">
            {m.description_en ?? <Muted>—</Muted>}
          </Field>
          <Field label="Beskrivelse (Dansk)">
            {m.description_da ?? <Muted>—</Muted>}
          </Field>
          <Field label="Manufacturer">
            {m.manufacturer ?? <Muted>—</Muted>}
          </Field>
          <Field label="Model year">
            {m.model_year != null ? (
              <span className="tabular-nums">{m.model_year}</span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label="Headline retail price">
            {m.headline_retail_price != null ? (
              <span className="tabular-nums">
                {formatMoney(
                  Number(m.headline_retail_price),
                  m.headline_currency,
                )}
              </span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label="Frame-number code">
            {m.frame_number_code ? (
              <span className="font-mono text-xs">{m.frame_number_code}</span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
        </dl>
      </Section>

      <VariantsSection
        modelId={m.id}
        rows={variantRows}
        modelIsRetired={m.deleted_at != null}
      />

      <TemplatesSection
        modelId={m.id}
        rows={templateRows}
        modelIsRetired={m.deleted_at != null}
      />

      <Section
        title="Bikes"
        description="Physical bikes ever built against this model."
        action={
          bikeCount > 0 ? (
            <Link
              href={`/bikes?model=${m.id}`}
              className="text-sm hover:underline"
            >
              View all in /bikes →
            </Link>
          ) : undefined
        }
      >
        {bikeCount === 0 ? (
          <EmptyRow>No bikes built against this model yet.</EmptyRow>
        ) : (
          <ul className="divide-y rounded-md border">
            {bikeRows.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bikes/${b.id}`}
                  className="hover:bg-muted/50 flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs">{b.frame_number}</span>
                    {b.bike_model_variant?.name_en ? (
                      <span className="text-muted-foreground text-xs">
                        {b.bike_model_variant.name_en}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {b.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
