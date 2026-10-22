/**
 * What the assistant ANSWERED (migration 119, `inbound_messages.assistant_answer`)
 * — beside the drafted actions in `command_plan`. Pure, safe on both sides of
 * the server/client line.
 *
 * - `text`: the reply, plain, in the person's language.
 * - `open`: ONE record the answer is about, offered as an Open button.
 * - `go`: the person asked to SEE it ("show me bike 55", owner 2026-10-01) —
 *   the screen goes straight there. A QUESTION about a record keeps `go`
 *   false, or the answer would be skipped on the way to the page.
 * - `choices`: several records matched; the person picks (never a guess).
 * - `list`: rows SHOWN with the reply and never read aloud (2026-10-22) — the
 *   voice says how many and how they divide, the screen shows them.
 *
 * A target is a KIND + an id the assistant's own lookups returned in the same
 * run (the guard in agent.ts); the href is derived here, never taken from the
 * model.
 */
export const TARGET_KINDS = [
  "bike",
  "customer",
  "part",
  "ticket",
  "work_order",
  "offer",
  "sales_order",
  "manufacturing_order",
  "purchase_order",
  "paint_order",
  "invoice",
  "calendar",
  // A call or a note — both open on /calls/<id>.
  "call",
  // The bike LIST, filtered: its id is the filter (`bikeListId`), made only
  // by the bike_overview tool, so the model cannot invent a view.
  "bike_list",
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export type AssistantTarget = { kind: TargetKind; id: string; label: string };

/** One row shown with a reply. */
export type AnswerListItem = { label: string; detail: string | null };

/** The most rows a reply shows; more than this is a page to open. */
export const ANSWER_LIST_MAX = 30;

export type AssistantAnswer = {
  text: string;
  open: AssistantTarget | null;
  /** Go straight to `open` instead of showing the answer. */
  go: boolean;
  choices: AssistantTarget[];
  /** Shown, never spoken. */
  list: AnswerListItem[];
};

const PATHS: Record<TargetKind, string> = {
  bike: "/bikes",
  customer: "/organizations",
  part: "/parts",
  ticket: "/maintenance/tickets",
  work_order: "/maintenance/work-orders",
  offer: "/offers",
  sales_order: "/sales-orders",
  manufacturing_order: "/manufacturing-orders",
  purchase_order: "/purchase-orders",
  paint_order: "/paint-orders",
  invoice: "/invoices",
  calendar: "/calendar",
  call: "/calls",
  bike_list: "/bikes",
};

/** Where a target lives. The calendar is one page, not a record; a list is its page with the filter. */
export function targetHref(t: { kind: TargetKind; id: string }): string {
  if (t.kind === "calendar") return PATHS.calendar;
  if (t.kind === "bike_list") return t.id === "all" ? PATHS.bike_list : `${PATHS.bike_list}?${t.id}`;
  return `${PATHS[t.kind]}/${t.id}`;
}

/** The filters the bike list page (/bikes) takes — the only ones a list view may carry. */
export type BikeListFilter = { status?: string; owner?: string; imported?: boolean };

/** A bike list view's id: its query string in a fixed order, or "all". */
export function bikeListId(f: BikeListFilter): string {
  const q = new URLSearchParams();
  if (f.imported) q.set("origin", "imported");
  if (f.status) q.set("status", f.status);
  if (f.owner) q.set("owner", f.owner);
  return q.toString() || "all";
}

export function isTargetKind(v: unknown): v is TargetKind {
  return typeof v === "string" && (TARGET_KINDS as readonly string[]).includes(v);
}

function target(raw: unknown): AssistantTarget | null {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!isTargetKind(o.kind) || !id) return null;
  return { kind: o.kind, id, label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : id };
}

/** Arbitrary JSON (a stored row, the model's tool input) → a well-formed answer. */
export function parseAssistantAnswer(raw: unknown): AssistantAnswer | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text.trim() : typeof o.answer === "string" ? o.answer.trim() : "";
  const choices = (Array.isArray(o.choices) ? o.choices : [])
    .map(target)
    .filter((c): c is AssistantTarget => c !== null)
    .slice(0, 8);
  const open = target(o.open);
  const list = (Array.isArray(o.list) ? o.list : [])
    .map((row): AnswerListItem | null => {
      const r = (typeof row === "object" && row !== null ? row : {}) as Record<string, unknown>;
      const label = typeof r.label === "string" ? r.label.trim().slice(0, 140) : typeof row === "string" ? row.trim().slice(0, 140) : "";
      const detail = typeof r.detail === "string" && r.detail.trim() ? r.detail.trim().slice(0, 200) : null;
      return label ? { label, detail } : null;
    })
    .filter((r): r is AnswerListItem => r !== null)
    .slice(0, ANSWER_LIST_MAX);
  return { text, open, go: open !== null && o.go === true, choices, list };
}
