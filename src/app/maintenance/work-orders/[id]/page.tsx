import Link from "next/link";
import { Field } from "@/components/field";
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
import { Money } from "@/components/money";
import { SegmentedId } from "@/components/segmented-id";
import { formatMoney } from "@/lib/parts/format";
import type { WorkOrderStatus } from "@/lib/maintenance/work-order-status";
import { CLOSED_WO_STATUSES } from "@/lib/maintenance/work-order-status";

import { WOHeader } from "./_components/wo-header";
import { WODetailsSection } from "./_components/wo-details-section";
import { WOPartsSection, type WOPartRow } from "./_components/wo-parts-section";
import type { PartChoice } from "./_components/wo-part-dialog";
import { Section } from "./_components/section";

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: wo, error } = await supabase
    .from("work_orders")
    .select(
      `
        id, wo_number, status, is_billable,
        diagnosis, work_performed, customer_summary_en, customer_summary_da,
        language, labor_minutes, labor_rate_dkk,
        started_at, completed_at, created_at, updated_at,
        ticket_id, covered_by_service_agreement_id,
        ticket:maintenance_tickets!ticket_id(id, ticket_number, status, description),
        bike:bikes!bike_id(
          id, frame_number,
          bike_type:bike_types(name_en),
          bike_template:bike_templates(family, frame_size, name_en),
          owner_organization:organizations!owner_organization_id(id, legal_name, display_name_da, display_name_en)
        ),
        service_agreement:service_agreements!covered_by_service_agreement_id(id, name_en, name_da)
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load work order: ${error.message}`);
  }
  if (!wo) notFound();

  const status = wo.status as WorkOrderStatus;
  const readOnly = CLOSED_WO_STATUSES.includes(status);

  const [woPartsRes, partsCatalogRes] = await Promise.all([
    supabase
      .from("work_order_parts")
      .select(
        `
          id, part_id, quantity, unit_price, installed_at,
          part:parts!part_id(id, internal_sku, name_en)
        `,
      )
      .eq("work_order_id", id)
      .order("installed_at", { ascending: true }),
    supabase
      .from("parts")
      .select(
        "id, internal_sku, name_en, default_retail_price, default_retail_currency, category:part_categories(name_en)",
      )
      .is("deleted_at", null)
      .order("internal_sku", { ascending: true }),
  ]);

  const partsCatalog: PartChoice[] = (partsCatalogRes.data ?? []).map((p) => ({
    id: p.id,
    internal_sku: p.internal_sku,
    name_en: p.name_en,
    category_name: p.category?.name_en ?? null,
  }));

  // Retail per part — work_order_parts.unit_price is the customer-facing
  // (retail) snapshot, so the dialog prefills retail, not cost.
  const retailByPartId = new Map<string, number>();
  for (const p of partsCatalogRes.data ?? []) {
    if (
      p.default_retail_price != null &&
      (p.default_retail_currency ?? "DKK") === "DKK"
    ) {
      retailByPartId.set(p.id, Number(p.default_retail_price));
    }
  }

  const woPartRows: WOPartRow[] = (woPartsRes.data ?? []).map((r) => ({
    id: r.id,
    partId: r.part_id,
    partSku: r.part?.internal_sku ?? "—",
    partName: r.part?.name_en ?? "—",
    quantity: Number(r.quantity),
    unitPrice: r.unit_price == null ? null : Number(r.unit_price),
    installedAt: r.installed_at,
  }));

  const partsSubtotal = woPartRows.reduce(
    (sum, r) => sum + (r.unitPrice != null ? r.unitPrice * r.quantity : 0),
    0,
  );
  const laborMinutes = wo.labor_minutes ?? 0;
  const laborRate = wo.labor_rate_dkk == null ? null : Number(wo.labor_rate_dkk);
  const laborSubtotal =
    laborRate != null && laborMinutes > 0
      ? (laborMinutes / 60) * laborRate
      : 0;
  const total = partsSubtotal + laborSubtotal;

  const bike = wo.bike;
  const owner = bike?.owner_organization ?? null;
  const ownerName =
    owner?.display_name_da ?? owner?.display_name_en ?? owner?.legal_name ?? null;
  const headline =
    wo.language === "da"
      ? (wo.customer_summary_da ?? wo.customer_summary_en)
      : (wo.customer_summary_en ?? wo.customer_summary_da);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/maintenance/tickets">Maintenance</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/maintenance/work-orders">Work orders</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              <SegmentedId value={wo.wo_number} />
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <WOHeader
        woId={wo.id}
        woNumber={wo.wo_number}
        status={status}
        isBillable={wo.is_billable}
        coveredByAgreementName={
          wo.service_agreement?.name_da ??
          wo.service_agreement?.name_en ??
          null
        }
        headline={headline}
        bikeId={bike?.id ?? ""}
        bikeFrameNumber={bike?.frame_number ?? "—"}
        bikeTypeName={bike?.bike_type?.name_en ?? null}
        ticketId={wo.ticket?.id ?? null}
        ticketNumber={wo.ticket?.ticket_number ?? null}
        startedAt={wo.started_at}
        completedAt={wo.completed_at}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <WODetailsSection
            woId={wo.id}
            readOnly={readOnly}
            initial={{
              diagnosis: wo.diagnosis ?? "",
              work_performed: wo.work_performed ?? "",
              customer_summary_en: wo.customer_summary_en ?? "",
              customer_summary_da: wo.customer_summary_da ?? "",
              language: wo.language === "en" ? "en" : "da",
              labor_minutes:
                wo.labor_minutes != null ? String(wo.labor_minutes) : "",
              labor_rate_dkk:
                wo.labor_rate_dkk != null ? String(wo.labor_rate_dkk) : "",
              is_billable: wo.is_billable,
            }}
          />

          {bike ? (
            <Section title="Bike">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="Frame number">
                  <Link
                    href={`/bikes/${bike.id}`}
                    className="hover:text-foreground font-mono text-sm underline-offset-4 hover:underline"
                  >
                    {bike.frame_number}
                  </Link>
                </Field>
                <Field label="Template / type">
                  {bike.bike_template ? (
                    <span className="text-sm">
                      {[
                        bike.bike_template.family,
                        bike.bike_template.frame_size,
                        bike.bike_template.name_en,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : bike.bike_type?.name_en ? (
                    <span className="text-sm">{bike.bike_type.name_en}</span>
                  ) : (
                    <Muted>—</Muted>
                  )}
                </Field>
                <Field label="Owner">
                  {owner && ownerName ? (
                    <Link
                      href={`/organizations/${owner.id}`}
                      className="hover:text-foreground text-sm underline-offset-4 hover:underline"
                    >
                      {ownerName}
                    </Link>
                  ) : (
                    <Muted>No owner on file</Muted>
                  )}
                </Field>
                {wo.ticket ? (
                  <Field label="Source ticket">
                    <Link
                      href={`/maintenance/tickets/${wo.ticket.id}`}
                      className="hover:text-foreground font-mono text-sm underline-offset-4 hover:underline"
                    >
                      {wo.ticket.ticket_number}
                    </Link>
                  </Field>
                ) : null}
              </dl>
            </Section>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <WOPartsSection
            woId={wo.id}
            rows={woPartRows}
            readOnly={readOnly}
            partsCatalog={partsCatalog}
            retailByPartId={retailByPartId}
          />

          <Section
            title="Cost summary"
            description={
              wo.is_billable
                ? "Parts at retail price + labour — the customer-facing total. Invoicing wires in M4."
                : "Parts at retail price + labour — this work is covered by a service agreement and won't be invoiced."
            }
          >
            <dl className="flex flex-col gap-2 text-sm">
              <SummaryRow
                label="Parts (retail)"
                value={
                  <Money
                    amount={partsSubtotal}
                    currency="DKK"
                    bold={false}
                  />
                }
              />
              <SummaryRow
                label={
                  laborMinutes > 0 && laborRate != null
                    ? `Labor (${laborMinutes} min × ${formatMoney(laborRate, "DKK")}/h)`
                    : "Labor"
                }
                value={
                  laborRate != null && laborMinutes > 0 ? (
                    <Money
                      amount={laborSubtotal}
                      currency="DKK"
                      bold={false}
                    />
                  ) : (
                    "—"
                  )
                }
              />
              <div className="my-1 border-t" />
              <SummaryRow
                label="Total"
                value={<Money amount={total} currency="DKK" />}
                strong
              />
              {!wo.is_billable && wo.service_agreement ? (
                <p className="text-muted-foreground mt-2 text-xs">
                  Covered by service agreement:{" "}
                  <span className="font-medium">
                    {wo.service_agreement.name_da ??
                      wo.service_agreement.name_en}
                  </span>
                </p>
              ) : null}
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground text-sm">{children}</span>;
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={
          strong
            ? "tabular-nums font-semibold"
            : "tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
