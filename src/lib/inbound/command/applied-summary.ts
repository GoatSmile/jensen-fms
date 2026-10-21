/**
 * What an applied suggestion MADE, in one sentence, and where it lives — from
 * the ledger row's payload, which every writer fills with the number or date
 * a person recognises. Pure, so the card (with its link), the secretary's
 * conversation (text only) and a spoken confirmation all say the same thing.
 * `t` is the `inboxCommand` namespace.
 */
import type { CommandAction } from "./plan";

type Applied = { entityTable: string | null; entityId: string | null; payload: unknown };
type T = (key: string, values?: Record<string, string | number>) => string;

const ENTITY_PATH: Record<string, string> = {
  bikes: "/bikes",
  organizations: "/organizations",
  offers: "/offers",
  sales_orders: "/sales-orders",
  maintenance_tickets: "/maintenance/tickets",
  purchase_orders: "/purchase-orders",
};

export function appliedSummary(applied: Applied | undefined, t: T, locale: string): { text: string; href: string | null } {
  const p = (applied?.payload ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const table = applied?.entityTable ?? null;
  const id = applied?.entityId ?? null;

  if (table === "calendar_events" && p.deleted) {
    return { text: t("resultCalendarDeleted", { title: str(p.title) ?? "" }), href: null };
  }
  if (table === "calendar_events") {
    const date = str(p.date);
    const time = str(p.time);
    const eventId = str(p.eventId);
    const kind = str(p.kind) === "delivery" ? "delivery" : "visit";
    const day = date
      ? new Intl.DateTimeFormat(locale === "da" ? "da-DK" : "en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${date}T12:00:00Z`))
      : "";
    const when = time ? `${day}, ${time}` : day;
    const text = p.moved
      ? t("resultCalendarMoved", { when })
      : t("resultCalendar", { kind: t(`type_draft_event_${kind}`), when });
    // Past entries live on the calendar's other tab.
    const past = date !== null && date < new Date().toISOString().slice(0, 10);
    if (!eventId) return { text, href: "/calendar" };
    const q = new URLSearchParams({ event: eventId });
    if (past) q.set("when", "past");
    return { text, href: `/calendar?${q.toString()}#ev-${eventId}` };
  }
  if (table === "inbound_messages" && p.note) {
    // A note the secretary saved: it waits in the Inbox, opens on its own page.
    return { text: t("resultNote"), href: id ? `/calls/${id}` : "/inbox" };
  }
  if (table === "contacts") {
    return {
      text: t(p.created ? "resultContactCreated" : "resultContactUpdated", { label: str(p.number) ?? "" }),
      href: str(p.organizationId) ? `/organizations/${str(p.organizationId)}` : null,
    };
  }
  if (table && p.bikeId !== undefined) {
    // An attached note: it now sits in that record's history.
    return {
      text: t("resultAttached", { label: str(p.number) ?? "" }),
      href: str(p.bikeId) ? `/bikes/${str(p.bikeId)}` : str(p.organizationId) ? `/organizations/${str(p.organizationId)}` : null,
    };
  }
  if (table === "purchase_orders") {
    const pos = Array.isArray(p.pos) ? (p.pos as { number?: string }[]) : [];
    return {
      text: t("resultPurchaseOrders", { numbers: pos.map((po) => po.number).filter(Boolean).join(", ") || "—" }),
      href: id ? `${ENTITY_PATH.purchase_orders}/${id}` : null,
    };
  }
  if (table && table in ENTITY_PATH) {
    return {
      text: t(`result_${table}`, { label: str(p.number) ?? str(p.legalName) ?? "" }),
      href: id ? `${ENTITY_PATH[table]}/${id}` : null,
    };
  }
  // A second press that lost the race, or a row written before its link.
  return { text: t("applied"), href: null };
}

/** A waiting suggestion in words — its kind and what it names. */
export function pendingSummary(action: CommandAction, t: T): string {
  const kind = t(action.type === "draft_event" ? `type_draft_event_${action.kind}` : `type_${action.type}`);
  const a = action as Record<string, unknown>;
  const what = [a.eventLabel, a.title, a.text, a.organizationLabel, a.legalName, a.description]
    .find((v): v is string => typeof v === "string" && v.length > 0);
  const when = action.type === "move_event" || action.type === "draft_event" ? [action.date, action.time].filter(Boolean).join(" ") : "";
  return [kind, what, when && `→ ${when}`].filter(Boolean).join(": ").replace(": →", " →");
}
