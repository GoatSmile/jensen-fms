/**
 * The only way mail leaves this app.
 *
 * `sendViaResend` is the transport; this is the layer that REMEMBERS. Before
 * migration 94 an outbound email left a timestamp and a recipient on the order
 * row and nothing else — no subject, no body, and no trace at all of a send
 * the provider rejected. So "what exactly did the painter get" could only be
 * answered by re-rendering the document from today's data, and the free-text
 * message typed into the send dialog was kept nowhere.
 *
 * One row per ATTEMPT: written `pending` before the provider is called, then
 * stamped `sent` (with the provider's id) or `failed` (with its complaint). A
 * crash between the two leaves the `pending` row standing, which is the honest
 * record of an attempt whose outcome nobody saw.
 *
 * Callers must have run `resolveRecipients()` already — `to` is exactly who
 * gets it, `intended` is who it would have gone to if outbound test mode were
 * off. Both are stored, because "we emailed the painter" and "we emailed our
 * own test inbox instead" must never look the same afterwards.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

import { sendViaResend, type SendEmailResult } from "./send";

type Supabase = SupabaseClient<Database>;

/** What this message is about — the shape the DB check constraint enforces. */
export type OutboundTarget =
  | { kind: "purchase_order"; purchaseOrderId: string }
  | { kind: "service_order"; serviceOrderId: string }
  | {
      kind: "notification";
      eventKey: string;
      /**
       * Everything the message is about — a digest covers several invoices.
       * The cron's idempotency question is an overlap against this set.
       */
      entityIds?: string[];
      /** The person notified. */
      personId?: string | null;
    };

export type SendAndRecordInput = {
  target: OutboundTarget;
  from: string;
  to: string[];
  /** Real recipients when test mode rerouted the send. */
  intended?: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  testMode: boolean;
  /** Who pressed the button; null for cron and other unattended sends. */
  actorPersonId?: string | null;
};

function targetColumns(target: OutboundTarget) {
  switch (target.kind) {
    case "purchase_order":
      return { kind: target.kind, purchase_order_id: target.purchaseOrderId };
    case "service_order":
      return { kind: target.kind, service_order_id: target.serviceOrderId };
    case "notification":
      return {
        kind: target.kind,
        event_key: target.eventKey,
        entity_ids: target.entityIds ?? [],
        person_id: target.personId ?? null,
      };
  }
}

/**
 * Record the attempt, send it, record the outcome.
 *
 * A failed INSERT never blocks the send: the business action (a paint order
 * reaching the painter) outranks its own bookkeeping, the same way a failed
 * notification never fails the action that triggered it. It is logged to the
 * server console and the send proceeds unrecorded — the one hole in "we keep
 * everything", and a loud one.
 */
export async function sendAndRecord(
  supabase: Supabase,
  input: SendAndRecordInput,
): Promise<SendEmailResult> {
  const { data: row, error: insertError } = await supabase
    .from("outbound_messages")
    .insert({
      ...targetColumns(input.target),
      channel: "email",
      actor_person_id: input.actorPersonId ?? null,
      from_email: input.from,
      to_emails: input.to,
      intended_to: input.intended ?? [],
      reply_to: input.replyTo ?? null,
      subject: input.subject,
      body_html: input.html,
      test_mode: input.testMode,
      status: "pending",
      provider: "resend",
    })
    .select("id")
    .single();
  if (insertError) {
    console.error(
      `[outbox] could not record the message before sending: ${insertError.message}`,
    );
  }

  const result = await sendViaResend({
    from: input.from,
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    html: input.html,
  });

  if (row) {
    const { error: stampError } = await supabase
      .from("outbound_messages")
      .update(
        result.ok
          ? {
              status: "sent",
              provider_id: result.providerId,
              completed_at: new Date().toISOString(),
            }
          : {
              status: "failed",
              error_detail: result.error,
              completed_at: new Date().toISOString(),
            },
      )
      .eq("id", row.id);
    if (stampError) {
      console.error(
        `[outbox] message ${row.id} stays pending — could not stamp the outcome: ${stampError.message}`,
      );
    }
  }

  return result;
}
