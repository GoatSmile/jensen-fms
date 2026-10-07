/**
 * The CommandPlan — what the command agent (agent.ts) proposes and the
 * CommandPlanPanel reviews / applies. Stored on `inbound_messages.command_plan`.
 *
 * Design rule (docs/plan-voice-commands.md): the model PROPOSES, code + a human
 * DISPOSE. So the agent fills a typed field when a resolver grounded a
 * reference, and leaves it null otherwise — the UNRESOLVED fields become OPEN
 * SLOTS the reviewer fills before Apply (derived here in `openSlotsFor`, never
 * trusted from the model). Nothing is ever invented: a missing template is an
 * open slot, not a guessed bike.
 *
 * Five action types. A sales order or an offer carries a SINGLE template line
 * (the founding utterance); multi-line voice orders are a VC-2 note. A CALL
 * from a customer drafts an OFFER, never a sales order — they asked, nothing
 * has been sold — and a repair drafts a TICKET (DECISIONS 2026-09-30).
 *
 * parseCommandPlan is the contract enforcer (à la parseExtraction): arbitrary
 * JSON — the model's tool input or a re-read row — normalizes to a well-formed
 * plan, dropping malformed actions, never throwing.
 */

import { isCalendarKind, type CalendarKind } from "@/lib/calendar/kinds";

export type CommandActionType =
  | "draft_customer"
  | "draft_offer"
  | "draft_sales_order"
  | "draft_ticket"
  | "draft_event"
  | "draft_purchase_order";

export type DraftCustomerAction = {
  id: string;
  type: "draft_customer";
  legalName: string;
  /** Resolved customer_segments.id, else null → open slot 'segment'. */
  segmentId: string | null;
  segmentLabel: string | null;
  preferredLanguage: "da" | "en";
};

export type DraftSalesOrderAction = {
  id: string;
  type: "draft_sales_order";
  /** Resolved existing organization, else null. */
  organizationId: string | null;
  organizationLabel: string | null;
  /** True → use the customer the plan's draft_customer action creates. */
  organizationFromNewCustomer: boolean;
  language: "da" | "en";
  currency: string;
  /** ISO date; null → today at apply. */
  orderDate: string | null;
  deliveryDate: string | null;
  deliveryPrecision: "exact" | "week" | null;
  productionNote: string | null;
  quantity: number;
  /** Resolved bike_templates.id, else null → open slot 'template'. */
  templateId: string | null;
  templateLabel: string | null;
  /** Resolved colors.id, else null → optional open slot 'color'. */
  colorId: string | null;
  colorLabel: string | null;
  /** null → the template's default retail price (or 0) at apply. */
  unitPrice: number | null;
};

/**
 * A quote for bikes the caller asked about — the customer-facing OFFER
 * (`offers`, OFF- series), in draft. Same single-template-line shape as the
 * sales order; what was said about specification and timing goes in `note`,
 * which lands in the offer's INTERNAL notes (they never reach the customer).
 */
export type DraftOfferAction = {
  id: string;
  type: "draft_offer";
  organizationId: string | null;
  organizationLabel: string | null;
  organizationFromNewCustomer: boolean;
  language: "da" | "en";
  currency: string;
  quantity: number;
  templateId: string | null;
  templateLabel: string | null;
  colorId: string | null;
  colorLabel: string | null;
  unitPrice: number | null;
  note: string | null;
};

/**
 * A repair ticket for a bike the caller already has. The bike is not the
 * model's to pick: at apply it is the call's own matched bike (exactly one
 * candidate, or none), the same rule as "Create ticket".
 */
export type DraftTicketAction = {
  id: string;
  type: "draft_ticket";
  /** What is wrong, in the caller's words, short. */
  description: string;
  urgency: "low" | "normal" | "high";
};

/**
 * Something for the calendar (migrations 117–122): a VISIT to a customer, or
 * a DELIVERY promised to one. Date and time are the model's reading and the
 * person's to correct before applying; a missing time takes the kind's
 * default (`src/lib/calendar/kinds.ts` — 09:00 for an hour). The title carries the customer and the errand ONLY:
 * phone numbers and contact names stay in the system, never in Google
 * (docs/plan-service-calendar.md).
 */
export type DraftEventAction = {
  id: string;
  type: "draft_event";
  kind: CalendarKind;
  title: string;
  /** ISO date, or null when none was named — the person picks one. */
  date: string | null;
  /** "HH:MM"; null → the kind's default. */
  time: string | null;
  /** Null → the kind's default. */
  durationMinutes: number | null;
  organizationId: string | null;
  organizationLabel: string | null;
  /** Where it is, when it was said. */
  location: string | null;
};

export type DraftPurchaseOrderItem = {
  partId: string;
  partLabel: string;
  quantity: number;
};

export type DraftPurchaseOrderAction = {
  id: string;
  type: "draft_purchase_order";
  items: DraftPurchaseOrderItem[];
  note: string | null;
};

export type CommandAction =
  | DraftCustomerAction
  | DraftOfferAction
  | DraftSalesOrderAction
  | DraftTicketAction
  | DraftEventAction
  | DraftPurchaseOrderAction;

export type CommandPlan = {
  summary: string;
  actions: CommandAction[];
  notes: string[];
};

/** An unresolved reference the reviewer must fill before an action can apply. */
export type OpenSlot = {
  key: "template" | "segment" | "color" | "customer";
  kind: "template" | "segment" | "color" | "customer";
  /** Optional — a colour slot doesn't block Apply; the others do. */
  optional: boolean;
};

/* ------------------------------------------------------------------ parse */

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function lang(v: unknown, fallback: "da" | "en"): "da" | "en" {
  const s = str(v)?.toLowerCase();
  return s === "en" ? "en" : s === "da" ? "da" : fallback;
}

function normalizeAction(raw: unknown, id: string): CommandAction | null {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  switch (o.type) {
    case "draft_customer": {
      const legalName = str(o.legalName);
      if (!legalName) return null; // no name → nothing to draft
      return {
        id,
        type: "draft_customer",
        legalName,
        segmentId: str(o.segmentId),
        segmentLabel: str(o.segmentLabel),
        preferredLanguage: lang(o.preferredLanguage, "da"),
      };
    }
    case "draft_sales_order": {
      const currency = (str(o.currency) ?? "DKK").toUpperCase().slice(0, 3);
      return {
        id,
        type: "draft_sales_order",
        organizationId: str(o.organizationId),
        organizationLabel: str(o.organizationLabel),
        organizationFromNewCustomer: o.organizationFromNewCustomer === true,
        language: lang(o.language, "da"),
        currency: currency.length === 3 ? currency : "DKK",
        orderDate: str(o.orderDate),
        deliveryDate: str(o.deliveryDate),
        deliveryPrecision:
          o.deliveryPrecision === "week"
            ? "week"
            : o.deliveryPrecision === "exact"
              ? "exact"
              : null,
        productionNote: str(o.productionNote),
        quantity: Math.max(1, Math.round(num(o.quantity) ?? 1)),
        templateId: str(o.templateId),
        templateLabel: str(o.templateLabel),
        colorId: str(o.colorId),
        colorLabel: str(o.colorLabel),
        unitPrice: num(o.unitPrice),
      };
    }
    case "draft_offer": {
      const currency = (str(o.currency) ?? "DKK").toUpperCase().slice(0, 3);
      return {
        id,
        type: "draft_offer",
        organizationId: str(o.organizationId),
        organizationLabel: str(o.organizationLabel),
        organizationFromNewCustomer: o.organizationFromNewCustomer === true,
        language: lang(o.language, "da"),
        currency: currency.length === 3 ? currency : "DKK",
        quantity: Math.max(1, Math.round(num(o.quantity) ?? 1)),
        templateId: str(o.templateId),
        templateLabel: str(o.templateLabel),
        colorId: str(o.colorId),
        colorLabel: str(o.colorLabel),
        unitPrice: num(o.unitPrice),
        note: str(o.note) ?? str(o.productionNote),
      };
    }
    case "draft_ticket": {
      const description = str(o.description) ?? str(o.note);
      if (!description) return null; // nothing to repair → nothing to draft
      const u = str(o.urgency)?.toLowerCase();
      return {
        id,
        type: "draft_ticket",
        description,
        urgency: u === "high" ? "high" : u === "low" ? "low" : "normal",
      };
    }
    // `draft_visit` is what the planner wrote before kinds existed (1 Oct) —
    // read it as a visit so a plan drafted then still applies.
    case "draft_visit":
    case "draft_event": {
      const title = str(o.title) ?? str(o.description);
      if (!title) return null;
      const kind = o.type === "draft_visit" ? "visit" : str(o.eventKind) ?? str(o.kind);
      const date = str(o.date) ?? str(o.visitDate);
      const time = str(o.time) ?? str(o.visitTime);
      const minutes = num(o.durationMinutes);
      return {
        id,
        type: "draft_event",
        // A parked kind (a reminder planned before 7 Oct) reads as a visit.
        kind: isCalendarKind(kind) ? kind : "visit",
        title,
        date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
        time: time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : null,
        durationMinutes: minutes && minutes >= 15 && minutes <= 600 ? Math.round(minutes) : null,
        organizationId: str(o.organizationId),
        organizationLabel: str(o.organizationLabel),
        location: str(o.location),
      };
    }
    case "draft_purchase_order": {
      const rawItems = Array.isArray(o.items) ? o.items : [];
      const items: DraftPurchaseOrderItem[] = [];
      for (const it of rawItems) {
        const io = (typeof it === "object" && it !== null ? it : {}) as Record<
          string,
          unknown
        >;
        const partId = str(io.partId);
        const quantity = num(io.quantity);
        if (!partId || !quantity || quantity <= 0) continue;
        items.push({
          partId,
          partLabel: str(io.partLabel) ?? partId,
          quantity: Math.round(quantity),
        });
      }
      if (items.length === 0) return null; // never invent parts
      return { id, type: "draft_purchase_order", items, note: str(o.note) };
    }
    default:
      return null;
  }
}

export function parseCommandPlan(raw: unknown): CommandPlan {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const rawActions = Array.isArray(o.actions) ? o.actions : [];
  const actions: CommandAction[] = [];
  rawActions.forEach((a, i) => {
    const normalized = normalizeAction(a, `a${i}`);
    if (normalized) actions.push(normalized);
  });
  const notes = Array.isArray(o.notes)
    ? o.notes.map(str).filter((n): n is string => n !== null)
    : [];
  return { summary: str(o.summary) ?? "", actions, notes };
}

/**
 * The unfilled references that block (or optionally accompany) applying an
 * action. Derived from the typed fields — never read off the model's output.
 */
export function openSlotsFor(action: CommandAction): OpenSlot[] {
  const slots: OpenSlot[] = [];
  if (action.type === "draft_customer" && !action.segmentId) {
    slots.push({ key: "segment", kind: "segment", optional: false });
  }
  // A customer not confirmed by a lookup is the person's to pick — required
  // for an order or offer, optional (an alternative) when the plan proposes
  // a NEW customer, optional for a visit. This is what stops a garbled name
  // from becoming a new customer (2026-10-01).
  if (action.type === "draft_sales_order" || action.type === "draft_offer") {
    if (!action.organizationId) {
      slots.push({ key: "customer", kind: "customer", optional: action.organizationFromNewCustomer });
    }
  }
  if (action.type === "draft_event" && !action.organizationId) {
    slots.push({ key: "customer", kind: "customer", optional: true });
  }
  if (action.type === "draft_sales_order" || action.type === "draft_offer") {
    if (!action.templateId) {
      slots.push({ key: "template", kind: "template", optional: false });
    }
    if (!action.colorId) {
      slots.push({ key: "color", kind: "color", optional: true });
    }
  }
  return slots;
}

/** Blocking (non-optional) slots left unfilled by the reviewer's picks. */
export function unfilledRequiredSlots(
  action: CommandAction,
  filled: Record<string, string | undefined>,
): OpenSlot[] {
  return openSlotsFor(action).filter(
    (s) => !s.optional && !filled[s.key],
  );
}
