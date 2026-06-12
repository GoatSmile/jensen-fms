import { createClient } from "@/lib/supabase/server";

import type { BikeOption, ContactOption } from "./ticket-form";

/**
 * Server-side helper that fetches the two pickable lists shared by /new and
 * /[id]/edit:
 *
 * - Bikes that physically exist and aren't gone: `planning`/`building`
 *   bikes are excluded (no physical bike to repair yet — defects during
 *   build belong on the build workbench, not a maintenance ticket), and so
 *   are retired / lost-or-stolen / soft-deleted ones. Same rule enforced
 *   server-side in save-ticket.ts.
 * - Contacts (not soft-deleted), with their organization joined so the form
 *   can filter to the chosen bike's owner roster.
 */
export async function loadTicketPickables(): Promise<{
  bikes: BikeOption[];
  contacts: ContactOption[];
}> {
  const supabase = await createClient();

  const [bikesRes, contactsRes] = await Promise.all([
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
      .not("status", "in", "(planning,building,retired,lost_or_stolen)")
      .order("frame_number", { ascending: true }),
    supabase
      .from("contacts")
      .select(
        `
          id, first_name, last_name, role, organization_id,
          organization:organizations!organization_id(legal_name, display_name_da, display_name_en)
        `,
      )
      .is("deleted_at", null)
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true, nullsFirst: false }),
  ]);

  if (bikesRes.error) {
    throw new Error(`Failed to load bikes: ${bikesRes.error.message}`);
  }
  if (contactsRes.error) {
    throw new Error(`Failed to load contacts: ${contactsRes.error.message}`);
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

  const contacts: ContactOption[] = (contactsRes.data ?? []).map((c) => {
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ");
    const orgName =
      c.organization?.display_name_da ??
      c.organization?.display_name_en ??
      c.organization?.legal_name ??
      null;
    return {
      id: c.id,
      full_name: fullName || "(no name)",
      organization_id: c.organization_id,
      organization_name: orgName,
      role: c.role,
    };
  });

  return { bikes, contacts };
}
