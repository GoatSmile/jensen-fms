import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Pencil, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SegmentedId } from "@/components/segmented-id";
import { OutboundMessageList } from "@/components/outbound-message-list";
import { loadOutboundForOrder } from "@/lib/email/outbox-queries";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/parts/format";
import { formatPrice } from "@/lib/format";
import type { CommercialLineRow } from "@/lib/commercial/lines";
import { loadOfferLineImages } from "@/lib/offers/line-images";
import {
  COMMERCIAL_LINE_SELECT,
  loadCommercialLineOptions,
  toCommercialLineRow,
  type RawCommercialLine,
} from "@/lib/commercial/options";
import {
  OFFER_STATUS_VARIANT,
  isExpired,
  isOfferEditable,
  type OfferStatus,
} from "@/lib/offers/status";

import { EmailOfferDialog } from "./_components/email-offer-dialog";
import { OfferActions } from "./_components/offer-actions";
import { OfferLinesSection } from "./_components/offer-lines-section";

export const dynamic = "force-dynamic";

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const [t, tCommon, tStatus, tOutbox] = await Promise.all([
    getTranslations("offerDetail"),
    getTranslations("common"),
    getTranslations("offerStatus"),
    getTranslations("outbox"),
  ]);
  const supabase = await createClient();

  const { data: offer, error } = await supabase
    .from("offers")
    .select(
      `id, offer_number, status, revision, language, issued_date, expiry_date,
       currency, subtotal_amount, total_vat_amount, total_amount, notes,
       organization:organizations!organization_id(
         id, legal_name, display_name_en, display_name_da, default_vat_code
       ),
       organization_unit:organization_units!organization_unit_id(id, name),
       contact:contacts!contact_id(id, first_name, last_name, role)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load offer: ${error.message}`);
  if (!offer) notFound();

  const status = offer.status as OfferStatus;
  const editable = isOfferEditable(status);
  const shownStatus: OfferStatus = isExpired(status, offer.expiry_date)
    ? "expired"
    : status;

  const [linesRes, options, settingsRes, sentMessages] = await Promise.all([
    supabase
      .from("offer_lines")
      .select(COMMERCIAL_LINE_SELECT)
      .eq("offer_id", id)
      .order("line_number", { ascending: true }),
    loadCommercialLineOptions(supabase),
    supabase
      .from("app_settings")
      .select("outbound_test_mode, outbound_test_email")
      .eq("id", 1)
      .maybeSingle(),
    loadOutboundForOrder(supabase, { offerId: id }),
  ]);

  const lineRows: CommercialLineRow[] = (linesRes.data ?? []).map((l) =>
    toCommercialLineRow(l as unknown as RawCommercialLine, locale),
  );
  const { parts, templates, vatCodes, colors } = options;

  // The picture on each line. One query for the whole table rather than one per
  // row; a line has at most one live picture (the uploader retires the old one).
  const imagesByLine = await loadOfferLineImages(
    supabase,
    lineRows.map((l) => l.id),
  );

  const customerName =
    offer.organization?.display_name_da ??
    offer.organization?.display_name_en ??
    offer.organization?.legal_name ??
    "—";
  const contactName = offer.contact
    ? `${[offer.contact.first_name, offer.contact.last_name].filter(Boolean).join(" ").trim() || t("noName")}${offer.contact.role ? ` · ${offer.contact.role}` : ""}`
    : null;

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
              <Link href="/offers">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              <SegmentedId value={offer.offer_number} />
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <SegmentedId value={offer.offer_number} />
            {offer.revision > 1 ? <span>{t("rev", { n: offer.revision })}</span> : null}
            <Badge variant={OFFER_STATUS_VARIANT[shownStatus] ?? "outline"}>
              {tStatus.has(shownStatus) ? tStatus(shownStatus) : shownStatus}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold">
            {offer.organization ? (
              <Link
                href={`/organizations/${offer.organization.id}`}
                className="hover:underline"
              >
                {customerName}
              </Link>
            ) : (
              customerName
            )}
          </h1>
          {offer.organization_unit?.name ? (
            <p className="text-muted-foreground text-sm">
              {offer.organization_unit.name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            {editable ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/offers/${offer.id}/edit`}>
                  <Pencil aria-hidden /> {t("edit")}
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={`/offers/${offer.id}/print`} target="_blank">
                <Printer aria-hidden /> {t("print")}
              </Link>
            </Button>
            {status !== "converted" ? (
              <EmailOfferDialog
                offerId={offer.id}
                isDraft={editable}
                testMode={settingsRes.data?.outbound_test_mode ?? true}
                testRecipients={settingsRes.data?.outbound_test_email ?? null}
              />
            ) : null}
          </div>
          <OfferActions
            offerId={offer.id}
            status={status}
            revision={Number(offer.revision ?? 1)}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label={t("statIssued")}>
          {formatDate(offer.issued_date) || <Muted>{t("notYetSent")}</Muted>}
        </Stat>
        <Stat label={t("statExpiry")}>
          {formatDate(offer.expiry_date) || <Muted>—</Muted>}
        </Stat>
        <Stat label={t("statContact")}>{contactName ?? <Muted>—</Muted>}</Stat>
        <Stat label={t("statLanguage")}>
          {offer.language === "da" ? "Dansk" : "English"}
        </Stat>
        <Stat label={t("statSubtotal")} className="tabular-nums">
          {formatPrice(
            offer.subtotal_amount != null ? Number(offer.subtotal_amount) : null,
            offer.currency,
          )}
        </Stat>
        <Stat label={t("statVat")} className="tabular-nums">
          {formatPrice(
            offer.total_vat_amount != null
              ? Number(offer.total_vat_amount)
              : null,
            offer.currency,
          )}
        </Stat>
        <Stat label={t("statTotal")} className="tabular-nums font-medium">
          {formatPrice(
            offer.total_amount != null ? Number(offer.total_amount) : null,
            offer.currency,
          )}
        </Stat>
      </dl>

      {offer.notes ? (
        <p className="text-muted-foreground bg-muted/30 rounded-md border p-3 text-sm whitespace-pre-wrap">
          {offer.notes}
        </p>
      ) : null}

      <OfferLinesSection
        offerId={offer.id}
        currency={offer.currency}
        defaultVatCode={offer.organization?.default_vat_code ?? null}
        editable={editable}
        rows={lineRows}
        imagesByLine={imagesByLine}
        parts={parts}
        templates={templates}
        vatCodes={vatCodes}
        colors={colors}
      />

      {/* What the customer actually received, kept verbatim (migration 94).
          The document is re-rendered from live data everywhere else, so after
          a revision this is the only place still holding the prices they
          read. */}
      <Panel title={tOutbox("title")} description={tOutbox("panelDesc")}>
        <OutboundMessageList rows={sentMessages} />
      </Panel>
    </div>
  );
}

function Stat({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs uppercase">{label}</dt>
      <dd className={`text-sm ${className ?? ""}`}>{children}</dd>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}
