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
 * VC-1 scope: three action types, and a sales order carries a SINGLE template
 * line (the founding utterance). Multi-line voice orders are a VC-2 note.
 *
 * parseCommandPlan is the contract enforcer (à la parseExtraction): arbitrary
 * JSON — the model's tool input or a re-read row — normalizes to a well-formed
 * plan, dropping malformed actions, never throwing.
 */

export type CommandActionType =
  | "draft_customer"
  | "draft_sales_order"
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
  | DraftSalesOrderAction
  | DraftPurchaseOrderAction;

export type CommandPlan = {
  summary: string;
  actions: CommandAction[];
  notes: string[];
};

/** An unresolved reference the reviewer must fill before an action can apply. */
export type OpenSlot = {
  key: "template" | "segment" | "color";
  kind: "template" | "segment" | "color";
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
  if (action.type === "draft_sales_order") {
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
