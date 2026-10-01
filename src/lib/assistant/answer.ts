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
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export type AssistantTarget = { kind: TargetKind; id: string; label: string };

export type AssistantAnswer = {
  text: string;
  open: AssistantTarget | null;
  /** Go straight to `open` instead of showing the answer. */
  go: boolean;
  choices: AssistantTarget[];
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
};

/** Where a target lives. The calendar is one page, not a record. */
export function targetHref(t: { kind: TargetKind; id: string }): string {
  return t.kind === "calendar" ? PATHS.calendar : `${PATHS[t.kind]}/${t.id}`;
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
  return { text, open, go: open !== null && o.go === true, choices };
}
