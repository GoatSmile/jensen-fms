import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createClient } from "@/lib/supabase/server";

import { loadTicketPickables } from "../../_components/load-pickables";
import {
  EMPTY_TICKET_FORM,
  TicketForm,
} from "../../_components/ticket-form";

const LANGUAGE_NONE = "__none__";

export default async function EditTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, tCommon] = await Promise.all([
    getTranslations("tickets"),
    getTranslations("common"),
  ]);
  const supabase = await createClient();

  const { data: ticket, error } = await supabase
    .from("maintenance_tickets")
    .select(
      `
        id, ticket_number, bike_id,
        reported_by_contact_id, reported_by_text,
        source, priority, description, reported_language, notes
      `,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load ticket: ${error.message}`);
  }
  if (!ticket) notFound();

  const { bikes, contacts } = await loadTicketPickables();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
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
            <BreadcrumbLink asChild>
              <Link
                href={`/maintenance/tickets/${ticket.id}`}
                className="font-mono"
              >
                {ticket.ticket_number}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("crumbEdit")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("editTitle")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("editSubtitle")}
        </p>
      </div>
      <TicketForm
        initial={{
          ...EMPTY_TICKET_FORM,
          // bike_id can be null for "unidentified bike" customer reports.
          // The form treats "" as unset; staff edits then assign the bike.
          bike_id: ticket.bike_id ?? "",
          reported_by_contact_id: ticket.reported_by_contact_id ?? "",
          reported_by_text: ticket.reported_by_text ?? "",
          source: ticket.source,
          priority: String(ticket.priority),
          description: ticket.description,
          reported_language: ticket.reported_language ?? LANGUAGE_NONE,
          notes: ticket.notes ?? "",
        }}
        bikes={bikes}
        contacts={contacts}
        mode={{ kind: "edit", ticketId: ticket.id }}
      />
    </div>
  );
}
