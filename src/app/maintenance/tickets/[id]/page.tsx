import Link from "next/link";
import { Field } from "@/components/field";
import { Section } from "@/components/section";
import { notFound } from "next/navigation";

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
  ticketPriorityLabel,
  ticketPriorityVariant,
  ticketSourceLabel,
  type TicketStatus,
} from "@/lib/maintenance/ticket-status";

import { TicketHeader } from "../_components/ticket-header";
import {
  WorkOrdersForTicketSection,
  type WORowForTicket,
} from "./_components/work-orders-for-ticket-section";
import type { WorkOrderStatus } from "@/lib/maintenance/work-order-status";

const LANGUAGE_LABEL: Record<string, string> = {
  da: "Dansk",
  en: "English",
};

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
          bike_type:bike_types(name_en),
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
    ? (LANGUAGE_LABEL[ticket.reported_language] ?? ticket.reported_language)
    : null;

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
        bikeTypeName={bike?.bike_type?.name_en ?? null}
        ownerOrganizationId={owner?.id ?? null}
        ownerName={ownerName}
      />

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
              title="Description"
              description="What the reporter told us."
            >
              <pre className="text-foreground whitespace-pre-wrap font-sans text-sm">
                {ticket.description}
              </pre>
              {languageLabel ? (
                <p className="text-muted-foreground mt-3 text-xs">
                  Reported in {languageLabel}.
                </p>
              ) : null}
            </Section>
          ) : languageLabel ? (
            <p className="text-muted-foreground text-xs">
              Reported in {languageLabel}.
            </p>
          ) : null}

          {attachments.length > 0 ? (
            <Section
              title="Photos & attachments"
              description={
                ticket.source === "app"
                  ? "Uploaded by the reporter from the bike sticker form."
                  : "Files attached to this ticket."
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
                      title={att.fileName ?? "Open file"}
                    >
                      {att.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Public Supabase storage URL; Next/Image not configured for that domain.
                        <img
                          src={att.fileUrl}
                          alt={att.fileName ?? "Ticket attachment"}
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="bg-muted text-muted-foreground flex aspect-square w-full items-center justify-center p-3 text-center text-xs break-all">
                          {att.fileName ?? "File"}
                        </div>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section
            title="Notes"
            description="Internal — for the workshop, not shared with the customer."
          >
            {ticket.notes ? (
              <pre className="text-foreground whitespace-pre-wrap font-sans text-sm">
                {ticket.notes}
              </pre>
            ) : (
              <p className="text-muted-foreground text-sm italic">
                No notes yet.
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
            title="Bike"
            className="border-sky-200/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20"
          >
            <dl className="flex flex-col gap-3">
              <Field label="Frame number">
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
              <Field label="Template / type">
                {templateLabel ? (
                  <span className="text-sm">{templateLabel}</span>
                ) : bike?.bike_type?.name_en ? (
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
            </dl>
          </Section>

          <Section
            title="Reporter"
            className="border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          >
            {contact ? (
              <dl className="flex flex-col gap-3">
                <Field label="Contact">
                  <span className="text-sm">{contactName}</span>
                  {contact.role ? (
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      · {contact.role}
                    </span>
                  ) : null}
                </Field>
                {contact.organization ? (
                  <Field label="Organization">
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
                  <Field label="Email">
                    <a
                      href={`mailto:${contact.email}`}
                      className="hover:text-foreground text-sm underline-offset-4 hover:underline"
                    >
                      {contact.email}
                    </a>
                  </Field>
                ) : null}
                {contact.phone ? (
                  <Field label="Phone">
                    <span className="text-sm">{contact.phone}</span>
                  </Field>
                ) : null}
              </dl>
            ) : reporterFallback ? (
              <dl className="flex flex-col gap-3">
                <Field label="From">
                  <span className="text-sm">{reporterFallback}</span>
                </Field>
                {ticket.reported_by_phone ? (
                  <Field label="Phone">
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

          <Section title="Classification">
            <dl className="flex flex-col gap-3">
              <Field label="Source">
                <Badge variant="outline" className="font-normal">
                  {ticketSourceLabel(ticket.source)}
                </Badge>
              </Field>
              <Field label="Priority">
                <Badge variant={ticketPriorityVariant(ticket.priority)}>
                  {ticketPriorityLabel(ticket.priority)}
                </Badge>
              </Field>
              <Field label="Reported">
                <span className="text-sm">
                  {formatDateTime(ticket.reported_at)}
                </span>
              </Field>
              {ticket.resolved_at ? (
                <Field label="Resolved">
                  <span className="text-sm">
                    {formatDateTime(ticket.resolved_at)}
                  </span>
                </Field>
              ) : null}
              <Field label="Created">
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
