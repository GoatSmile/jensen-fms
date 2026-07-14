import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { Field } from "@/components/field";
import { Section } from "@/components/section";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { localizedName } from "@/i18n/vocab";

import { Badge } from "@/components/ui/badge";
import { SegmentedId } from "@/components/segmented-id";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/parts/format";
import {
  ticketPriorityVariant,
  type TicketStatus,
} from "@/lib/maintenance/ticket-status";

import { TicketHeader } from "../_components/ticket-header";
import {
  WorkOrdersForTicketSection,
  type WORowForTicket,
} from "./_components/work-orders-for-ticket-section";
import type { WorkOrderStatus } from "@/lib/maintenance/work-order-status";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tCommon, tSource, tPriority, locale] = await Promise.all([
    getTranslations("tickets"),
    getTranslations("common"),
    getTranslations("ticketSource"),
    getTranslations("ticketPriority"),
    getLocale(),
  ]);
  const languageLabelMap: Record<string, string> = {
    da: t("langDa"),
    en: t("langEn"),
  };
  const supabase = await createClient();

  const { data: ticket, error } = await supabase
    .from("maintenance_tickets")
    .select(
      `
        id, ticket_number, status, priority, source,
        description, reported_language, notes,
        reported_at, resolved_at, created_at, updated_at,
        reported_by_text, reported_by_phone,
        bike:bikes!bike_id(
          id, frame_number,
          bike_type:bike_types(name_en, name_da),
          bike_template:bike_templates(family:bike_families(name), frame_size, name_en, version),
          owner_organization:organizations!owner_organization_id(id, legal_name, display_name_da, display_name_en)
        ),
        contact:contacts!reported_by_contact_id(
          id, first_name, last_name, role, email, phone,
          organization:organizations!organization_id(id, legal_name, display_name_da, display_name_en)
        )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load ticket: ${error.message}`);
  }
  if (!ticket) notFound();

  // Pull WOs linked to this ticket, plus their parts totals. The totals view
  // doesn't exist yet, so we sum work_order_parts in-memory — at typical
  // volumes per ticket (one or two WOs), this is fine.
  const [{ data: woData }, { data: attachmentData }] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        `
          id, wo_number, status, is_billable, started_at, completed_at,
          work_order_parts(quantity, unit_price)
        `,
      )
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true }),
    // Photos / files attached to the ticket — most commonly a photo the
    // customer uploaded from the public /b/<id> report form.
    supabase
      .from("attachments")
      .select("id, file_url, file_name, mime_type, created_at")
      .eq("entity_type", "maintenance_ticket")
      .eq("entity_id", ticket.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  // Provenance: was this ticket drafted from an inbound message (voicemail →
  // ticket pipeline)? If so, surface a "review me" banner linking back.
  const { data: inboundMsg } = await supabase
    .from("inbound_messages")
    .select("id, channel")
    .eq("ticket_id", ticket.id)
    .maybeSingle();

  const attachments = (attachmentData ?? []).map((a) => ({
    id: a.id,
    fileUrl: a.file_url,
    fileName: a.file_name,
    mimeType: a.mime_type,
    isImage: (a.mime_type ?? "").startsWith("image/"),
  }));

  const workOrderRows: WORowForTicket[] = (woData ?? []).map((w) => {
    const partsTotal = (w.work_order_parts ?? []).reduce(
      (sum, p) =>
        sum + (p.unit_price != null ? Number(p.unit_price) * Number(p.quantity) : 0),
      0,
    );
    return {
      id: w.id,
      wo_number: w.wo_number,
      status: w.status as WorkOrderStatus,
      is_billable: w.is_billable,
      started_at: w.started_at,
      completed_at: w.completed_at,
      parts_total_dkk: partsTotal,
    };
  });

  const bike = ticket.bike;
  const owner = bike?.owner_organization ?? null;
  const ownerName =
    owner?.display_name_da ?? owner?.display_name_en ?? owner?.legal_name ?? null;
  const contact = ticket.contact;
  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
      "(no name)"
    : null;
  const reporterFallback = ticket.reported_by_text;
  const bikeTypeName =
    localizedName(locale, bike?.bike_type?.name_en, bike?.bike_type?.name_da) ||
    null;
  const templateLabel = bike?.bike_template
    ? [
        bike.bike_template.family?.name,
        bike.bike_template.frame_size,
        bike.bike_template.name_en,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const languageLabel = ticket.reported_language
    ? (languageLabelMap[ticket.reported_language] ?? ticket.reported_language)
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
              <Link href="/maintenance/tickets">{t("title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              <SegmentedId value={ticket.ticket_number} />
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <TicketHeader
        ticketId={ticket.id}
        ticketNumber={ticket.ticket_number}
        status={ticket.status as TicketStatus}
        priority={ticket.priority}
        description={ticket.description}
        bikeId={bike?.id ?? ""}
        bikeFrameNumber={bike?.frame_number ?? "—"}
        bikeTypeName={bikeTypeName}
        ownerOrganizationId={owner?.id ?? null}
        ownerName={ownerName}
      />

      {inboundMsg ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <PhoneCall
              className="size-4 text-amber-700 dark:text-amber-500"
              aria-hidden
            />
            <span className="font-medium text-amber-800 dark:text-amber-300">
              {t("fromInboundBanner")}
            </span>
            <Link
              href={`/admin/inbound/${inboundMsg.id}`}
              className="text-amber-800 underline dark:text-amber-300"
            >
              {t("reviewInbound")}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/*
           * Description card only when the header isn't already showing
           * the whole thing. Short reports ("the bike is too distracting")
           * fit fully in the header — repeating them below as a Description
           * section reads as duplication. Long descriptions, or anything
           * with paragraph breaks, get the body card.
           */}
          {ticket.description.trim().length > 60 ||
          ticket.description.includes("\n") ? (
            <Section
              title={t("descriptionTitle")}
              description={t("descriptionDesc")}
            >
              <pre className="text-foreground whitespace-pre-wrap font-sans text-sm">
                {ticket.description}
              </pre>
              {languageLabel ? (
                <p className="text-muted-foreground mt-3 text-xs">
                  {t("reportedIn", { language: languageLabel })}
                </p>
              ) : null}
            </Section>
          ) : languageLabel ? (
            <p className="text-muted-foreground text-xs">
              {t("reportedIn", { language: languageLabel })}
            </p>
          ) : null}

          {attachments.length > 0 ? (
            <Section
              title={t("photosTitle")}
              description={
                ticket.source === "app"
                  ? t("photosDescApp")
                  : t("photosDescOther")
              }
            >
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {attachments.map((att) => (
                  <li key={att.id}>
                    <a
                      href={att.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:border-foreground/40 block overflow-hidden rounded-md border"
                      title={att.fileName ?? t("openFile")}
                    >
                      {att.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Public Supabase storage URL; Next/Image not configured for that domain.
                        <img
                          src={att.fileUrl}
                          alt={att.fileName ?? t("ticketAttachment")}
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="bg-muted text-muted-foreground flex aspect-square w-full items-center justify-center p-3 text-center text-xs break-all">
                          {att.fileName ?? t("fileFallback")}
                        </div>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title={t("notesTitle")} description={t("notesDesc")}>
            {ticket.notes ? (
              <pre className="text-foreground whitespace-pre-wrap font-sans text-sm">
                {ticket.notes}
              </pre>
            ) : (
              <p className="text-muted-foreground text-sm italic">
                {t("noNotes")}
              </p>
            )}
          </Section>

          <WorkOrdersForTicketSection
            ticketId={ticket.id}
            ticketStatus={ticket.status as TicketStatus}
            rows={workOrderRows}
          />
        </div>

        <div className="flex flex-col gap-6">
          <Section
            title={t("bikeTitle")}
            className="border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20"
          >
            <dl className="flex flex-col gap-3">
              <Field label={t("frameNumber")}>
                {bike ? (
                  <Link
                    href={`/bikes/${bike.id}`}
                    className="hover:text-foreground font-mono text-sm underline-offset-4 hover:underline"
                  >
                    {bike.frame_number}
                  </Link>
                ) : (
                  <Muted>—</Muted>
                )}
              </Field>
              <Field label={t("templateType")}>
                {templateLabel ? (
                  <span className="text-sm">{templateLabel}</span>
                ) : bikeTypeName ? (
                  <span className="text-sm">{bikeTypeName}</span>
                ) : (
                  <Muted>—</Muted>
                )}
              </Field>
              <Field label={t("owner")}>
                {owner && ownerName ? (
                  <Link
                    href={`/organizations/${owner.id}`}
                    className="hover:text-foreground text-sm underline-offset-4 hover:underline"
                  >
                    {ownerName}
                  </Link>
                ) : (
                  <Muted>{t("noOwnerOnFile")}</Muted>
                )}
              </Field>
            </dl>
          </Section>

          <Section
            title={t("reporterTitle")}
            className="border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          >
            {contact ? (
              <dl className="flex flex-col gap-3">
                <Field label={t("contact")}>
                  <span className="text-sm">{contactName}</span>
                  {contact.role ? (
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      · {contact.role}
                    </span>
                  ) : null}
                </Field>
                {contact.organization ? (
                  <Field label={t("organization")}>
                    <Link
                      href={`/organizations/${contact.organization.id}`}
                      className="hover:text-foreground text-sm underline-offset-4 hover:underline"
                    >
                      {contact.organization.display_name_da ??
                        contact.organization.display_name_en ??
                        contact.organization.legal_name}
                    </Link>
                  </Field>
                ) : null}
                {contact.email ? (
                  <Field label={t("email")}>
                    <a
                      href={`mailto:${contact.email}`}
                      className="hover:text-foreground text-sm underline-offset-4 hover:underline"
                    >
                      {contact.email}
                    </a>
                  </Field>
                ) : null}
                {contact.phone ? (
                  <Field label={t("phone")}>
                    <span className="text-sm">{contact.phone}</span>
                  </Field>
                ) : null}
              </dl>
            ) : reporterFallback ? (
              <dl className="flex flex-col gap-3">
                <Field label={t("from")}>
                  <span className="text-sm">{reporterFallback}</span>
                </Field>
                {ticket.reported_by_phone ? (
                  <Field label={t("phone")}>
                    <a
                      href={`tel:${ticket.reported_by_phone}`}
                      className="hover:text-foreground text-sm underline-offset-4 hover:underline"
                    >
                      {ticket.reported_by_phone}
                    </a>
                  </Field>
                ) : null}
              </dl>
            ) : (
              <Muted>—</Muted>
            )}
          </Section>

          <Section title={t("classificationTitle")}>
            <dl className="flex flex-col gap-3">
              <Field label={t("source")}>
                <Badge variant="outline" className="font-normal">
                  {tSource(ticket.source)}
                </Badge>
              </Field>
              <Field label={t("priority")}>
                <Badge variant={ticketPriorityVariant(ticket.priority)}>
                  {tPriority(String(ticket.priority))}
                </Badge>
              </Field>
              <Field label={t("reported")}>
                <span className="text-sm">
                  {formatDateTime(ticket.reported_at)}
                </span>
              </Field>
              {ticket.resolved_at ? (
                <Field label={t("resolved")}>
                  <span className="text-sm">
                    {formatDateTime(ticket.resolved_at)}
                  </span>
                </Field>
              ) : null}
              <Field label={t("created")}>
                <span className="text-muted-foreground text-xs">
                  {formatDate(ticket.created_at)}
                </span>
              </Field>
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
