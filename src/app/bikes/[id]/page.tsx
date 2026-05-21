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
import { ColorChip } from "@/components/color-swatch";
import { createClient } from "@/lib/supabase/server";
import type { BikeStatus } from "@/lib/bikes/status";

import {
  AssignCustomerDialog,
  type OrganizationOption,
  type OrgUnitOption,
} from "./_components/assign-customer-dialog";
import { BikeHeader } from "./_components/bike-header";
import {
  IdentifiersSection,
  type IdentifierRow,
} from "./_components/identifiers-section";
import type { IdentifierTypeOption } from "./_components/identifier-dialog";
import {
  PartsInstalledSection,
  type InstalledPartRow,
} from "./_components/parts-installed-section";
import type { PhotoRow } from "./_components/photo-thumb";
import { PhotosSection } from "./_components/photos-section";
import { Section } from "./_components/section";
import {
  StateLogSection,
  type StateLogRow,
} from "./_components/state-log-section";

function formatDateDa(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default async function BikeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    bikeRes,
    identifiersRes,
    partsRes,
    stateLogRes,
    identifierTypesRes,
    orgsRes,
    unitsRes,
    attachmentsRes,
  ] = await Promise.all([
      supabase
        .from("bikes")
        .select(
          `
            id, frame_number, status, notes, deleted_at, bike_type_id,
            manufacturing_order_id, build_cost_dkk,
            owner_organization_id, owner_unit_id, assigned_at,
            bike_type:bike_types(id, name_en),
            template:bike_templates(id, name_en, family, frame_size, version),
            color:colors(id, slug, name_en, hex),
            manufacturing_order:manufacturing_orders(id, mo_number, status),
            owner_organization:organizations!owner_organization_id(
              id, legal_name, display_name_en, display_name_da,
              segment:customer_segments(name_en)
            ),
            owner_unit:organization_units!owner_unit_id(id, name)
          `,
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("bike_identifiers")
        .select(
          `
            id, identifier_value, is_active, created_at, deactivated_at,
            identifier_type:bike_identifier_types(id, name_en)
          `,
        )
        .eq("bike_id", id)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("bike_parts")
        .select(
          `
            id, quantity, installed_at, removed_at, notes,
            parts:parts(id, internal_sku, name_en)
          `,
        )
        .eq("bike_id", id)
        .order("installed_at", { ascending: true }),
      supabase
        .from("bike_state_log")
        .select("id, from_status, to_status, occurred_at, reason")
        .eq("bike_id", id)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("bike_identifier_types")
        .select("id, slug, name_en, format_regex, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      // Active customers for the assign dialog — loaded eagerly so the dialog
      // opens instantly. At 50+ customers this becomes a search-as-you-type
      // problem; fine to defer until then.
      supabase
        .from("organizations")
        .select(
          `id, legal_name, display_name_en, display_name_da,
           segment:customer_segments(name_en)`,
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("legal_name", { ascending: true }),
      supabase
        .from("organization_units")
        .select("id, organization_id, name")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("attachments")
        .select("id, file_url, file_name, purpose, created_at")
        .eq("entity_type", "bike")
        .eq("entity_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

  if (bikeRes.error) {
    throw new Error(`Failed to load bike: ${bikeRes.error.message}`);
  }
  if (!bikeRes.data) notFound();

  const b = bikeRes.data;

  // Required identifiers for this bike type — used to compute "X of Y registered".
  const requiredRes = await supabase
    .from("bike_type_required_identifiers")
    .select("bike_identifier_type_id, is_required")
    .eq("bike_type_id", b.bike_type_id);

  const requiredTypes = new Map<string, boolean>();
  for (const row of requiredRes.data ?? []) {
    if (row.is_required) requiredTypes.set(row.bike_identifier_type_id, true);
  }

  // Active identifier rows by type id, used both to compute completion and to
  // tell the dialog which types are already registered.
  const activeIdentifierTypeIds = new Set(
    (identifiersRes.data ?? [])
      .filter((r) => r.is_active)
      .map((r) => r.identifier_type?.id)
      .filter((x): x is string => x != null),
  );

  const identifierRows: IdentifierRow[] = (identifiersRes.data ?? []).map(
    (r) => ({
      id: r.id,
      typeId: r.identifier_type?.id ?? "",
      typeName: r.identifier_type?.name_en ?? "—",
      isRequired:
        r.identifier_type?.id != null
          ? requiredTypes.has(r.identifier_type.id)
          : false,
      value: r.identifier_value,
      isActive: r.is_active,
      createdAt: r.created_at,
      deactivatedAt: r.deactivated_at,
    }),
  );

  const identifierTypeOptions: IdentifierTypeOption[] = (
    identifierTypesRes.data ?? []
  ).map((t) => ({
    id: t.id,
    slug: t.slug,
    name_en: t.name_en,
    format_regex: t.format_regex,
    is_required: requiredTypes.has(t.id),
    alreadyRegistered: activeIdentifierTypeIds.has(t.id),
  }));

  const requiredCount = requiredTypes.size;
  const requiredRegisteredCount = Array.from(requiredTypes.keys()).filter((id) =>
    activeIdentifierTypeIds.has(id),
  ).length;

  const partRows: InstalledPartRow[] = (partsRes.data ?? []).map((r) => ({
    id: r.id,
    partId: r.parts?.id ?? "",
    partSku: r.parts?.internal_sku ?? "—",
    partName: r.parts?.name_en ?? "—",
    quantity: Number(r.quantity),
    installedAt: r.installed_at,
    removedAt: r.removed_at,
    notes: r.notes,
  }));

  const stateRows: StateLogRow[] = (stateLogRes.data ?? []).map((r) => ({
    id: r.id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    occurredAt: r.occurred_at,
    reason: r.reason,
  }));

  const templateLabel = b.template
    ? [b.template.family, b.template.frame_size, b.template.name_en]
        .filter(Boolean)
        .join(" · ")
    : null;

  const ownerOrgDisplay =
    b.owner_organization?.display_name_da ??
    b.owner_organization?.display_name_en ??
    b.owner_organization?.legal_name ??
    null;

  // Photos: hero first, then gallery (most recent first via the order on the query).
  const photoRows: PhotoRow[] = (attachmentsRes.data ?? [])
    .map((row) => ({
      id: row.id,
      fileUrl: row.file_url,
      fileName: row.file_name,
      purpose: row.purpose ?? "gallery",
    }))
    .sort((a, b) => {
      if (a.purpose === b.purpose) return 0;
      return a.purpose === "hero" ? -1 : 1;
    });

  const organizations: OrganizationOption[] = (orgsRes.data ?? []).map((o) => ({
    id: o.id,
    legal_name: o.legal_name,
    display_name: o.display_name_da ?? o.display_name_en ?? null,
    segment_name: o.segment?.name_en ?? null,
  }));
  const organizationUnits: OrgUnitOption[] = (unitsRes.data ?? []).map((u) => ({
    id: u.id,
    organization_id: u.organization_id,
    name: u.name,
  }));

  // Only terminal statuses block the customer picker. Building/planning bikes
  // can be slated for a known customer so the tech sees who it's for; in_stock
  // assigns at delivery; in_service / assigned reassign in place.
  const assignBlocked =
    b.deleted_at != null ||
    b.status === "retired" ||
    b.status === "lost_or_stolen";
  const assignBlockedReason =
    b.deleted_at != null
      ? "Bike is archived."
      : assignBlocked
        ? `A "${b.status}" bike is out of the active fleet.`
        : undefined;

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
              <Link href="/bikes">Bikes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{b.frame_number}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <BikeHeader
        bikeId={b.id}
        frameNumber={b.frame_number}
        status={b.status as BikeStatus}
        bikeTypeName={b.bike_type?.name_en ?? null}
        templateLabel={templateLabel}
        colorName={b.color?.name_en ?? null}
        colorHex={b.color?.hex ?? null}
        isDeleted={b.deleted_at != null}
        assignAction={
          <AssignCustomerDialog
            bikeId={b.id}
            disabled={assignBlocked}
            disabledReason={assignBlockedReason}
            bikeStatus={b.status}
            currentOwner={
              b.owner_organization
                ? {
                    organizationId: b.owner_organization.id,
                    organizationName: ownerOrgDisplay ?? "Customer",
                    unitId: b.owner_unit?.id ?? null,
                    unitName: b.owner_unit?.name ?? null,
                  }
                : null
            }
            organizations={organizations}
            organizationUnits={organizationUnits}
          />
        }
      />

      <Section
        title="Identification"
        description="Catalog references — all optional. The frame number on the header is the primary identifier."
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Bike type">
            {b.bike_type?.name_en ?? <Muted>—</Muted>}
          </Field>
          <Field label="Template">
            {b.template ? (
              <Link
                href={`/bike-templates/${b.template.id}`}
                className="hover:underline"
              >
                {templateLabel}{" "}
                <span className="text-muted-foreground text-xs">
                  v{b.template.version}
                </span>
              </Link>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label="Colour">
            {b.color ? (
              <ColorChip hex={b.color.hex} label={b.color.name_en} />
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label="Manufacturing order">
            {b.manufacturing_order ? (
              <Link
                href={`/manufacturing-orders/${b.manufacturing_order.id}`}
                className="font-mono text-xs hover:underline"
              >
                {b.manufacturing_order.mo_number}
              </Link>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label="Owner">
            {b.owner_organization ? (
              <div className="flex flex-col gap-0.5">
                <Link
                  href={`/organizations/${b.owner_organization.id}`}
                  className="hover:underline"
                >
                  {ownerOrgDisplay}
                </Link>
                {b.owner_unit ? (
                  <span className="text-muted-foreground text-xs">
                    Unit: {b.owner_unit.name}
                  </span>
                ) : null}
                {b.assigned_at ? (
                  <span className="text-muted-foreground text-xs">
                    Since {formatDateDa(b.assigned_at)}
                  </span>
                ) : null}
              </div>
            ) : (
              <Muted>Not assigned to a customer.</Muted>
            )}
          </Field>
          <Field label="Build cost">
            {b.build_cost_dkk != null ? (
              <span className="tabular-nums">
                {new Intl.NumberFormat("da-DK", {
                  style: "currency",
                  currency: "DKK",
                  maximumFractionDigits: 2,
                }).format(Number(b.build_cost_dkk))}
              </span>
            ) : (
              <Muted>—</Muted>
            )}
          </Field>
          <Field label="Notes">
            {b.notes ? b.notes : <Muted>—</Muted>}
          </Field>
        </dl>
      </Section>

      <PhotosSection bikeId={b.id} photos={photoRows} />

      <IdentifiersSection
        bikeId={b.id}
        rows={identifierRows}
        identifierTypes={identifierTypeOptions}
        requiredCount={requiredCount}
        requiredRegisteredCount={requiredRegisteredCount}
      />

      <PartsInstalledSection rows={partRows} />

      <StateLogSection rows={stateRows} />
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
