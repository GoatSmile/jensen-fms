/**
 * Notification-event registry — only events with a real (or imminently
 * real) delivery hook belong here; `role_notifications` rows may only
 * subscribe to these keys. Same doctrine as capabilities: config can only
 * subscribe to what code fires. Delivery lands in P4 — the admin UI
 * already edits subscriptions, so P4 is pure delivery work.
 *
 * i18n: event keys contain dots (next-intl's separator), so admin labels
 * live under the camelCased keys in NOTIFICATION_EVENT_LABEL_KEYS,
 * resolved in the `adminPeople` namespace.
 */
export const NOTIFICATION_EVENTS = [
  "ticket.created",
  "wo.assigned",
  "inbound.failed",
  "inbound.order_inquiry",
  "invoice.overdue",
  "agreement.expiring",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export function isNotificationEvent(value: string): value is NotificationEvent {
  return (NOTIFICATION_EVENTS as readonly string[]).includes(value);
}

export const NOTIFICATION_EVENT_LABEL_KEYS: Record<NotificationEvent, string> =
  {
    "ticket.created": "eventTicketCreated",
    "wo.assigned": "eventWoAssigned",
    "inbound.failed": "eventInboundFailed",
    "inbound.order_inquiry": "eventInboundOrderInquiry",
    "invoice.overdue": "eventInvoiceOverdue",
    "agreement.expiring": "eventAgreementExpiring",
  };
