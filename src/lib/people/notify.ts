/**
 * Notification delivery (people & roles P4).
 *
 * Flow per the design (docs/plan-people-roles.md): an event fires →
 * subscribed roles (`role_notifications`) → active people holding them →
 * deliver per person channel flags. Email goes THROUGH the communication
 * test-mode reroute (the owner's standing rule for every outbound
 * channel); SMS waits for GatewayAPI; Web Push later. `wo.assigned` is
 * person-targeted rather than role-broadcast — pass `directPersonId`.
 *
 * Deliberately fire-and-forget from the caller's perspective: a failed
 * email must NEVER fail the business action that triggered it. Every attempt
 * — accepted or refused — is recorded in `outbound_messages` (migration 94,
 * superseding `notification_log`) with its subject and body; the overdue cron
 * reads it for idempotency, everything else as audit.
 *
 * Email copy is bilingual-by-recipient: each person gets their
 * `preferred_language`. Content lives with the hook (a `(lang) =>
 * {subject, html}` builder), not in the messages namespaces — emails are
 * per-recipient documents, not app chrome.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadCommunicationSettings,
  resolveRecipients,
} from "@/lib/communication/settings";
import { sendAndRecord } from "@/lib/email/outbox";
import type { Database } from "@/lib/types/database";

import type { NotificationEvent } from "./notifications";

type Supabase = SupabaseClient<Database>;

export type EmailContent = { subject: string; html: string };
export type ContentBuilder = (lang: "da" | "en") => EmailContent;
export type NotifyResult = { sent: number; skipped: number };

type Recipient = {
  id: string;
  full_name: string;
  email: string;
  preferred_language: string | null;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDeliverable(p: {
  is_active: boolean;
  notify_email: boolean;
  email: string | null;
  engaged_until: string | null;
}): boolean {
  return (
    p.is_active &&
    p.notify_email &&
    !!p.email &&
    (!p.engaged_until || p.engaged_until >= todayISO())
  );
}

/** Active, email-deliverable people in the roles subscribed to an event. */
async function resolveRoleRecipients(
  supabase: Supabase,
  eventKey: NotificationEvent,
): Promise<Recipient[]> {
  const { data: subs } = await supabase
    .from("role_notifications")
    .select("role:roles(id, is_active)")
    .eq("event_key", eventKey);
  const roleIds = (subs ?? [])
    .map((s) => s.role)
    .filter((r): r is NonNullable<typeof r> => !!r && r.is_active)
    .map((r) => r.id);
  if (roleIds.length === 0) return [];

  const { data: members } = await supabase
    .from("person_roles")
    .select(
      "person:people(id, full_name, email, preferred_language, is_active, notify_email, engaged_until)",
    )
    .in("role_id", roleIds);

  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  for (const m of members ?? []) {
    const p = m.person;
    if (!p || seen.has(p.id) || !isDeliverable(p)) continue;
    seen.add(p.id);
    recipients.push({
      id: p.id,
      full_name: p.full_name,
      email: p.email as string,
      preferred_language: p.preferred_language,
    });
  }
  return recipients;
}

/** A single person as recipient (person-targeted events like wo.assigned). */
async function resolveDirectRecipient(
  supabase: Supabase,
  personId: string,
): Promise<Recipient[]> {
  const { data: p } = await supabase
    .from("people")
    .select(
      "id, full_name, email, preferred_language, is_active, notify_email, engaged_until",
    )
    .eq("id", personId)
    .maybeSingle();
  if (!p || !isDeliverable(p)) return [];
  return [
    {
      id: p.id,
      full_name: p.full_name,
      email: p.email as string,
      preferred_language: p.preferred_language,
    },
  ];
}

/**
 * The send loop: one email per recipient in their language (test mode
 * reroutes + '[TEST]' subject + intended-for banner, same convention as
 * the PO email), then one log row per (entity × person).
 */
async function deliver(
  supabase: Supabase,
  recipients: Recipient[],
  eventKey: NotificationEvent,
  entityIds: (string | null)[],
  buildContent: ContentBuilder,
): Promise<NotifyResult> {
  if (recipients.length === 0) return { sent: 0, skipped: 0 };

  const settings = await loadCommunicationSettings(supabase);
  if (!settings.fromEmail) return { sent: 0, skipped: recipients.length };

  let sent = 0;
  let skipped = 0;
  for (const person of recipients) {
    const resolved = resolveRecipients(settings, [person.email]);
    if (!resolved.ok) {
      skipped += 1;
      continue;
    }
    const lang = person.preferred_language?.trim() === "en" ? "en" : "da";
    const content = buildContent(lang);
    const subject = resolved.testMode
      ? `[TEST] ${content.subject}`
      : content.subject;
    const html = resolved.testMode
      ? `<p style="background:#fef3c7;padding:8px 12px;border-radius:6px;">` +
        `Test mode — intended for: ${escapeHtml(resolved.intended.join(", "))}</p>` +
        content.html
      : content.html;

    // One row per message, carrying every entity it covered — the digest is
    // one email about N invoices, and the cron asks about the set.
    const result = await sendAndRecord(supabase, {
      target: {
        kind: "notification",
        eventKey,
        // A null entity means "not about a row" (an event with no subject of
        // its own); the array simply omits it.
        entityIds: entityIds.filter((id): id is string => id != null),
        personId: person.id,
      },
      from: settings.fromEmail,
      to: resolved.to,
      intended: resolved.intended,
      replyTo: settings.replyToEmail,
      subject,
      html,
      testMode: resolved.testMode,
    });
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    sent += 1;
  }
  return { sent, skipped };
}

/**
 * Fire one event for one entity. Role broadcast by default;
 * `directPersonId` makes it person-targeted. Swallows every failure —
 * callers must not break on notification trouble.
 */
export async function notifyEvent(
  supabase: Supabase,
  input: {
    eventKey: NotificationEvent;
    entityId?: string | null;
    buildContent: ContentBuilder;
    directPersonId?: string;
  },
): Promise<NotifyResult> {
  try {
    const recipients = input.directPersonId
      ? await resolveDirectRecipient(supabase, input.directPersonId)
      : await resolveRoleRecipients(supabase, input.eventKey);
    return await deliver(
      supabase,
      recipients,
      input.eventKey,
      [input.entityId ?? null],
      input.buildContent,
    );
  } catch {
    return { sent: 0, skipped: 0 };
  }
}

/**
 * One digest email per subscribed person covering MANY entities (the
 * overdue-invoices cron), logged per entity for idempotency.
 */
export async function notifyDigest(
  supabase: Supabase,
  input: {
    eventKey: NotificationEvent;
    entityIds: string[];
    buildContent: ContentBuilder;
  },
): Promise<NotifyResult> {
  try {
    const recipients = await resolveRoleRecipients(supabase, input.eventKey);
    return await deliver(
      supabase,
      recipients,
      input.eventKey,
      input.entityIds,
      input.buildContent,
    );
  } catch {
    return { sent: 0, skipped: 0 };
  }
}

/**
 * Has this event ever been SENT for this entity? (Cron idempotency.)
 *
 * Reads `outbound_messages` since migration 94, and counts only `sent`: the
 * old log held successes only, so a rejected send used to look like no send at
 * all and got retried. That behaviour is preserved deliberately — a digest the
 * provider refused should go out tomorrow.
 */
export async function hasNotified(
  supabase: Supabase,
  eventKey: NotificationEvent,
  entityId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("outbound_messages")
    .select("id", { count: "exact", head: true })
    .eq("kind", "notification")
    .eq("event_key", eventKey)
    .eq("status", "sent")
    .contains("entity_ids", [entityId]);
  return (count ?? 0) > 0;
}
