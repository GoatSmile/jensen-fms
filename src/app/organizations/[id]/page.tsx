import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/section";
import { notFound } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { countryName } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";

import { AssignedBikesSection } from "../_components/assigned-bikes-section";
import { OrganizationHeader } from "../_components/organization-header";
import {
  ContactsSection,
  type ContactRow,
} from "./_components/contacts-section";
import { UnitsSection, type UnitRow } from "./_components/units-section";

function dlRow(label: string, value: React.ReactNode) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tCustomers, tCommon, tLang] = await Promise.all([
    getTranslations("customerDetail"),
    getTranslations("customers"),
    getTranslations("common"),
    getTranslations("lang"),
  ]);
  const langLabel = (code: string | null) =>
    code ? (tLang.has(code) ? tLang(code) : code) : null;
  const supabase = await createClient();

  // Parallel fetch: org, contacts, sub-units, and the per-unit bike counts.
  // Bike counts feed the Units section so the user can see at a glance how
  // many bikes still point at each sub-unit before archiving it.
  const [orgRes, contactsRes, unitsRes, unitBikeCountsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        `
          id, legal_name, display_name_en, display_name_da,
          cvr_number, ean_number, vat_number,
          address_line1, address_line2, zip_code, city, state_province,
          country_code, phone, email, website,
          billing_currency, payment_terms_days, default_vat_code,
          preferred_language, notes,
          deleted_at, is_active, created_at,
          segment:customer_segments(id, name_en)
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select(
        `
          id, first_name, last_name, role, email, phone,
          preferred_language, is_primary, notes
        `,
      )
      .eq("organization_id", id)
      .is("deleted_at", null)
      // Primary first, then alphabetical by surname/first name so the list
      // reads predictably even without explicit user sorting.
      .order("is_primary", { ascending: false })
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true, nullsFirst: false }),
    supabase
      .from("organization_units")
      .select("id, name, code, address, notes")
      .eq("organization_id", id)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("bikes")
      .select("owner_unit_id")
      .eq("owner_organization_id", id)
      .is("deleted_at", null)
      .not("owner_unit_id", "is", null),
  ]);

  if (orgRes.error) {
    throw new Error(`Failed to load customer: ${orgRes.error.message}`);
  }
  if (!orgRes.data) notFound();

  const o = orgRes.data;

  if (contactsRes.error) {
    throw new Error(`Failed to load contacts: ${contactsRes.error.message}`);
  }
  if (unitsRes.error) {
    throw new Error(`Failed to load sub-units: ${unitsRes.error.message}`);
  }
  if (unitBikeCountsRes.error) {
    throw new Error(
      `Failed to load sub-unit bike counts: ${unitBikeCountsRes.error.message}`,
    );
  }

  const contactRows: ContactRow[] = (contactsRes.data ?? []).map((c) => ({
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    role: c.role,
    email: c.email,
    phone: c.phone,
    preferred_language: c.preferred_language,
    is_primary: c.is_primary,
    notes: c.notes,
  }));

  // Aggregate the per-unit bike counts in JS. PostgREST doesn't expose
  // GROUP BY directly without an RPC, and the row count here is bounded by
  // the bikes belonging to a single org so this is cheap.
  const unitBikeCounts = new Map<string, number>();
  for (const row of unitBikeCountsRes.data ?? []) {
    if (!row.owner_unit_id) continue;
    unitBikeCounts.set(
      row.owner_unit_id,
      (unitBikeCounts.get(row.owner_unit_id) ?? 0) + 1,
    );
  }

  const unitRows: UnitRow[] = (unitsRes.data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    code: u.code,
    address: u.address,
    notes: u.notes,
    bikeCount: unitBikeCounts.get(u.id) ?? 0,
  }));
  const subtitleCandidate =
    o.display_name_da && o.display_name_da !== o.legal_name
      ? o.display_name_da
      : o.display_name_en && o.display_name_en !== o.legal_name
        ? o.display_name_en
        : null;

  // Address as a postal block — skips lines that are missing.
  const addressLines: string[] = [];
  if (o.address_line1) addressLines.push(o.address_line1);
  if (o.address_line2) addressLines.push(o.address_line2);
  const zipLine = [o.zip_code, o.city].filter(Boolean).join(" ");
  if (zipLine) addressLines.push(zipLine);
  if (o.state_province) addressLines.push(o.state_province);
  if (o.country_code) addressLines.push(countryName(o.country_code));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
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
              <Link href="/organizations">{tCustomers("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{o.legal_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {o.deleted_at ? (
        <div className="bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-300 rounded-md border border-amber-300 px-3 py-2 text-sm">
          {t("archivedBanner")}
        </div>
      ) : null}

      <OrganizationHeader
        organizationId={o.id}
        legalName={o.legal_name}
        subtitle={subtitleCandidate}
        segmentLabel={o.segment?.name_en ?? null}
        countryCode={o.country_code}
        preferredLanguage={o.preferred_language}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Section title={t("secIdentification")}>
            <dl>
              {dlRow(
                "CVR",
                o.cvr_number ? (
                  <span className="font-mono text-sm">{o.cvr_number}</span>
                ) : null,
              )}
              {dlRow(
                "EAN",
                o.ean_number ? (
                  <span className="font-mono text-sm">{o.ean_number}</span>
                ) : null,
              )}
              {dlRow(
                "VAT",
                o.vat_number ? (
                  <span className="font-mono text-sm">{o.vat_number}</span>
                ) : null,
              )}
            </dl>
          </Section>

          <Section title={t("secAddress")}>
            {addressLines.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noAddress")}</p>
            ) : (
              <address className="text-sm not-italic leading-6">
                {addressLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </address>
            )}
          </Section>

          <Section title={t("secContact")}>
            <dl>
              {dlRow(
                t("fldEmail"),
                o.email ? (
                  <a
                    href={`mailto:${o.email}`}
                    className="font-mono text-sm hover:underline"
                  >
                    {o.email}
                  </a>
                ) : null,
              )}
              {dlRow(
                t("fldPhone"),
                o.phone ? (
                  <a href={`tel:${o.phone}`} className="text-sm hover:underline">
                    {o.phone}
                  </a>
                ) : null,
              )}
              {dlRow(
                t("fldWebsite"),
                o.website ? (
                  <a
                    href={o.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:underline"
                  >
                    {o.website}
                  </a>
                ) : null,
              )}
              {dlRow(t("fldLanguage"), langLabel(o.preferred_language))}
            </dl>
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title={t("secBilling")}>
            <dl>
              {dlRow(t("fldCurrency"), o.billing_currency)}
              {dlRow(
                t("fldPaymentTerms"),
                o.payment_terms_days == null
                  ? null
                  : t("netDays", { count: o.payment_terms_days }),
              )}
              {dlRow(t("fldDefaultVat"), o.default_vat_code)}
            </dl>
          </Section>

          {o.notes ? (
            <Section title={t("secNotes")}>
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {o.notes}
              </p>
            </Section>
          ) : null}
        </div>
      </div>

      <UnitsSection organizationId={o.id} rows={unitRows} />
      <ContactsSection organizationId={o.id} rows={contactRows} />
      <AssignedBikesSection organizationId={o.id} />
    </div>
  );
}

