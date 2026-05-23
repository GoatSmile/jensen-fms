import { createClient } from "@/lib/supabase/server";
import { OPEN_TICKET_STATUSES } from "@/lib/maintenance/ticket-status";

import type { BikeOption, TicketOption } from "./wo-form";

/**
 * Server-side helper that loads the pickable lists shared by the new-WO page:
 *
 * - Bikes that aren't retired or lost/stolen, with template + owner joined.
 * - Open-ish maintenance tickets, so the form can offer "this WO resolves a
 *   ticket" without listing closed/cancelled ones.
 */
export async function loadWOPickables(): Promise<{
  bikes: BikeOption[];
  tickets: TicketOption[];
}> {
  const supabase = await createClient();

  const [bikesRes, ticketsRes] = await Promise.all([
    supabase
      .from("bikes")
      .select(
        `
          id, frame_number, owner_organization_id,
          bike_type:bike_types(name_en),
          bike_template:bike_templates(family, frame_size, name_en),
          owner_organization:organizations!owner_organization_id(id, legal_name, display_name_da, display_name_en)
        `,
      )
      .is("deleted_at", null)
      .not("status", "in", "(retired,lost_or_stolen)")
      .order("frame_number", { ascending: true }),
    supabase
      .from("maintenance_tickets")
      .select("id, ticket_number, status, description, bike_id")
      .in("status", OPEN_TICKET_STATUSES)
      .order("reported_at", { ascending: false }),
  ]);

  if (bikesRes.error) {
    throw new Error(`Failed to load bikes: ${bikesRes.error.message}`);
  }
  if (ticketsRes.error) {
    throw new Error(`Failed to load tickets: ${ticketsRes.error.message}`);
  }

  const bikes: BikeOption[] = (bikesRes.data ?? []).map((b) => {
    const templateLabel = b.bike_template
      ? [b.bike_template.family, b.bike_template.frame_size]
          .filter(Boolean)
          .join(" · ")
      : null;
    const ownerName =
      b.owner_organization?.display_name_da ??
      b.owner_organization?.display_name_en ??
      b.owner_organization?.legal_name ??
      null;
    return {
      id: b.id,
      frame_number: b.frame_number,
      template_label: templateLabel,
      bike_type_name: b.bike_type?.name_en ?? null,
      owner_organization_id: b.owner_organization_id,
      owner_name: ownerName,
    };
  });

  // Untriaged customer reports (bike_id = NULL, from /report/help) can't
  // anchor a work order yet — a staff member needs to identify the bike
  // first. Filter them out so the picker only shows actionable tickets.
  const tickets: TicketOption[] = (ticketsRes.data ?? [])
    .filter((t): t is typeof t & { bike_id: string } => t.bike_id != null)
    .map((t) => ({
      id: t.id,
      ticket_number: t.ticket_number,
      status: t.status,
      description: t.description ?? "",
      bike_id: t.bike_id,
    }));

  return { bikes, tickets };
}
