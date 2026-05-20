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

import { AssignedBikesSection } from "../_components/assigned-bikes-section";
import { OrganizationHeader } from "../_components/organization-header";

function dlRow(label: string, value: React.ReactNode) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const LANGUAGE_LABEL: Record<string, string> = {
  da: "Dansk",
  en: "English",
};

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const orgRes = await supabase
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
    .maybeSingle();

  if (orgRes.error) {
    throw new Error(`Failed to load customer: ${orgRes.error.message}`);
  }
  if (!orgRes.data) notFound();

  const o = orgRes.data;
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
  if (o.country_code) addressLines.push(o.country_code);

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
              <Link href="/organizations">Customers</Link>
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
          This customer is archived. Bikes still pointed here keep that link
          for historical reference.
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
          <Section title="Identification">
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

          <Section title="Address">
            {addressLines.length === 0 ? (
              <p className="text-muted-foreground text-sm">No address on file.</p>
            ) : (
              <address className="text-sm not-italic leading-6">
                {addressLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </address>
            )}
          </Section>

          <Section title="Contact">
            <dl>
              {dlRow(
                "Email",
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
                "Phone",
                o.phone ? (
                  <a href={`tel:${o.phone}`} className="text-sm hover:underline">
                    {o.phone}
                  </a>
                ) : null,
              )}
              {dlRow(
                "Website",
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
              {dlRow(
                "Language",
                LANGUAGE_LABEL[o.preferred_language ?? ""] ??
                  o.preferred_language ??
                  null,
              )}
            </dl>
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Billing">
            <dl>
              {dlRow("Currency", o.billing_currency)}
              {dlRow(
                "Payment terms",
                o.payment_terms_days == null
                  ? null
                  : `Net ${o.payment_terms_days} ${o.payment_terms_days === 1 ? "day" : "days"}`,
              )}
              {dlRow("Default VAT code", o.default_vat_code)}
            </dl>
          </Section>

          {o.notes ? (
            <Section title="Notes">
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {o.notes}
              </p>
            </Section>
          ) : null}
        </div>
      </div>

      <AssignedBikesSection organizationId={o.id} />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
