/**
 * Reading the outbox. Metadata only — the body is fetched one message at a
 * time by `loadOutboundBody` when someone opens it, because a list of
 * documents would otherwise ship every rendered email to the browser.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

type Supabase = SupabaseClient<Database>;

export type OutboundStatus = "pending" | "sent" | "failed";

export type OutboundRow = {
  id: string;
  createdAt: string;
  kind: string;
  subject: string;
  to: string[];
  intended: string[];
  testMode: boolean;
  status: OutboundStatus;
  errorDetail: string | null;
  eventKey: string | null;
  /** Who pressed the button; null for cron and other unattended sends. */
  actorName: string | null;
  /** The document this belonged to, for the admin list's link. */
  purchaseOrderId: string | null;
  serviceOrderId: string | null;
};

const SELECT = `
  id, created_at, kind, subject, to_emails, intended_to, test_mode, status,
  error_detail, event_key, purchase_order_id, service_order_id,
  actor:people!actor_person_id(id, full_name)
`;

type Raw = {
  id: string;
  created_at: string;
  kind: string;
  subject: string;
  to_emails: string[] | null;
  intended_to: string[] | null;
  test_mode: boolean;
  status: string;
  error_detail: string | null;
  event_key: string | null;
  purchase_order_id: string | null;
  service_order_id: string | null;
  actor:
    | { id: string; full_name: string }
    | { id: string; full_name: string }[]
    | null;
};

function toRow(r: Raw): OutboundRow {
  const actor = Array.isArray(r.actor) ? r.actor[0] : r.actor;
  return {
    id: r.id,
    createdAt: r.created_at,
    kind: r.kind,
    subject: r.subject,
    to: r.to_emails ?? [],
    intended: r.intended_to ?? [],
    testMode: r.test_mode,
    status: (["pending", "sent", "failed"] as const).includes(
      r.status as OutboundStatus,
    )
      ? (r.status as OutboundStatus)
      : "pending",
    errorDetail: r.error_detail,
    eventKey: r.event_key,
    actorName: actor?.full_name ?? null,
    purchaseOrderId: r.purchase_order_id,
    serviceOrderId: r.service_order_id,
  };
}

/** Everything ever sent for one document, newest first. */
export async function loadOutboundForOrder(
  supabase: Supabase,
  target: { purchaseOrderId: string } | { serviceOrderId: string },
): Promise<OutboundRow[]> {
  const query = supabase
    .from("outbound_messages")
    .select(SELECT)
    .order("created_at", { ascending: false });
  const { data, error } =
    "purchaseOrderId" in target
      ? await query.eq("purchase_order_id", target.purchaseOrderId)
      : await query.eq("service_order_id", target.serviceOrderId);
  if (error) {
    throw new Error(`Failed to load sent messages: ${error.message}`);
  }
  return (data as unknown as Raw[] | null)?.map(toRow) ?? [];
}

/** The admin outbox: everything, newest first, optionally narrowed. */
export async function loadOutbox(
  supabase: Supabase,
  filters: { kind?: string | null; status?: string | null; limit?: number },
): Promise<OutboundRow[]> {
  let query = supabase
    .from("outbound_messages")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load the outbox: ${error.message}`);
  }
  return (data as unknown as Raw[] | null)?.map(toRow) ?? [];
}
