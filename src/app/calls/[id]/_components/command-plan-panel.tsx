"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, Play, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import type { CommandAction, CommandPlan } from "@/lib/inbound/command/plan";
import type { AppliedAction } from "@/lib/inbound/command/plan-context";
import { isOptionalOnCall, openSlotsFor } from "@/lib/inbound/command/plan";
import { CALENDAR_KIND_SPECS } from "@/lib/calendar/kinds";

import { applyCommandAction, rerunCommandAgent } from "../../_actions/command";

type VocabItem = { id: string; label: string };
type AppliedRow = AppliedAction;

type Props = {
  messageId: string;
  plan: CommandPlan;
  /** command_actions already applied, keyed by plan_action_id. */
  applied: Record<string, AppliedRow>;
  templates: VocabItem[];
  segments: VocabItem[];
  colors: VocabItem[];
  /** For the "Which customer?" slot: everyone, and the close spellings first. */
  customers?: VocabItem[];
  suggestedCustomers?: VocabItem[];
  /** A CALL's plan: its optional cards (the repair ticket) sort last and say so. */
  fromCall?: boolean;
  /** Called after an apply or a re-run succeeds — for a surface that holds
   *  the plan in its own state (the floating panel) rather than re-rendering
   *  from the server. */
  onChanged?: () => void;
};

const ENTITY_PATH: Record<string, string> = {
  organizations: "/organizations",
  offers: "/offers",
  sales_orders: "/sales-orders",
  maintenance_tickets: "/maintenance/tickets",
  purchase_orders: "/purchase-orders",
};

/**
 * Review surface for a kind='command' message (VC-1). Renders the agent's
 * proposed plan: grounded references as chips, unresolved ones as pickers
 * (open slots), and an Apply button per action that calls the existing draft
 * verbs. Mirrors match-panel's chip vocabulary + routed-action's Apply flow.
 * Nothing auto-applies — the human is the disposer.
 */
export function CommandPlanPanel({
  messageId,
  plan,
  applied,
  templates,
  segments,
  colors,
  customers = [],
  suggestedCustomers = [],
  fromCall = false,
  onChanged,
}: Props) {
  const t = useTranslations("inboxCommand");
  const [error, setError] = useState<string | null>(null);
  const [rerunPending, startRerun] = useTransition();
  // Per-action open-slot picks: { [actionId]: { template: id, ... } }.
  const [picks, setPicks] = useState<Record<string, Record<string, string>>>({});

  function setPick(actionId: string, key: string, value: string) {
    setPicks((p) => ({ ...p, [actionId]: { ...p[actionId], [key]: value } }));
  }

  function rerun() {
    setError(null);
    startRerun(async () => {
      const r = await rerunCommandAgent(messageId);
      if (!r.ok) return setError(r.error);
      onChanged?.();
    });
  }

  const customerApplied = useMemo(
    () =>
      plan.actions.some(
        (a) => a.type === "draft_customer" && applied[a.id]?.entityId,
      ),
    [plan.actions, applied],
  );
  // Once anything is applied, re-planning would remint positional ids and
  // desync the ledger — the server action refuses it, so lock the button too.
  const anyApplied = Object.keys(applied).length > 0;
  // On a call the optional cards come last; ids stay positional, so this only
  // reorders the view.
  const orderedActions = fromCall
    ? [...plan.actions.filter((a) => !isOptionalOnCall(a)), ...plan.actions.filter(isOptionalOnCall)]
    : plan.actions;

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden />
          {t("planTitle")}
        </span>
      }
      action={
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={rerun}
          disabled={rerunPending || anyApplied}
          title={anyApplied ? t("rerunLocked") : undefined}
        >
          <Play aria-hidden />
          {rerunPending ? t("rerunning") : t("rerun")}
        </Button>
      }
      contentClassName="flex flex-col gap-4"
    >
      {plan.summary ? (
        <p className="text-ink-2 bg-ground rounded-md p-3 text-sm">
          {plan.summary}
        </p>
      ) : null}

      {plan.actions.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">{t("noActions")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orderedActions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              optional={fromCall && isOptionalOnCall(action)}
              applied={applied[action.id]}
              customerApplied={customerApplied}
              picks={picks[action.id] ?? {}}
              onPick={(key, value) => setPick(action.id, key, value)}
              templates={templates}
              segments={segments}
              colors={colors}
              customers={customers}
              suggestedCustomers={suggestedCustomers}
              messageId={messageId}
              onError={setError}
              onApplied={onChanged}
            />
          ))}
        </ul>
      )}

      {plan.notes.length > 0 ? (
        <div className="text-muted-foreground text-xs">
          <span className="font-medium">{t("notesLabel")}:</span>{" "}
          {plan.notes.join(" · ")}
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}

function ActionCard({
  action,
  optional,
  applied,
  customerApplied,
  picks,
  onPick,
  templates,
  segments,
  colors,
  customers,
  suggestedCustomers,
  messageId,
  onError,
  onApplied,
}: {
  action: CommandAction;
  optional: boolean;
  applied: AppliedRow | undefined;
  customerApplied: boolean;
  picks: Record<string, string>;
  onPick: (key: string, value: string) => void;
  templates: VocabItem[];
  segments: VocabItem[];
  colors: VocabItem[];
  customers: VocabItem[];
  suggestedCustomers: VocabItem[];
  messageId: string;
  onError: (e: string | null) => void;
  onApplied?: () => void;
}) {
  const t = useTranslations("inboxCommand");
  const [pending, start] = useTransition();

  const slots = openSlotsFor(action);
  const requiredUnfilled = slots.some((s) => !s.optional && !picks[s.key]);
  // An order or offer that references a not-yet-created customer must wait.
  const waitsForCustomer =
    (action.type === "draft_sales_order" || action.type === "draft_offer") &&
    !action.organizationId &&
    action.organizationFromNewCustomer &&
    !customerApplied &&
    // Picking an existing customer instead is the other way past it.
    !picks.customer;

  const isApplied = Boolean(applied?.entityId) || Boolean(applied);
  // A calendar entry needs a date — the one said, or one picked on the card.
  const isEvent = action.type === "draft_event";
  const eventDate = isEvent ? (picks.date ?? action.date ?? "") : "";
  const eventMissingDate = isEvent && !eventDate;
  const spec = isEvent ? CALENDAR_KIND_SPECS[action.kind] : null;
  // An emptied time field is "all day"; untouched, the said time or the kind's default.
  const eventTime = isEvent ? (picks.time !== undefined ? picks.time : (action.time ?? spec?.defaultTime ?? "")) : "";
  const canApply = !isApplied && !requiredUnfilled && !waitsForCustomer && !eventMissingDate;

  function apply() {
    onError(null);
    start(async () => {
      const r = await applyCommandAction(messageId, action.id, picks);
      if (!r.ok) return onError(r.error);
      onApplied?.();
    });
  }

  // The model the card names: the planner's, else the one picked on the card
  // — after applying, the ledger's, since the picks do not survive a reload.
  const appliedTemplateId = (applied?.payload as { templateId?: unknown } | null)?.templateId;
  const pickedTemplateId = typeof appliedTemplateId === "string" ? appliedTemplateId : picks.template;
  const modelLabel =
    ("templateLabel" in action ? action.templateLabel : null) ??
    templates.find((tpl) => tpl.id === pickedTemplateId)?.label ??
    null;

  const vocabFor = (kind: string): VocabItem[] =>
    kind === "template" ? templates : kind === "segment" ? segments : colors;

  return (
    <li
      className={cn(
        "border-rule flex flex-col gap-2.5 rounded-md border p-3.5",
        isApplied ? "bg-good-wash" : "bg-ground",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          {isEvent ? t(`type_draft_event_${action.kind}`) : t(`type_${action.type}`)}
        </span>
        {optional && !isApplied ? (
          <span className="text-muted-foreground text-xs">{t("optionalCard")}</span>
        ) : null}
      </div>

      <ActionSummary action={action} modelLabel={modelLabel} />

      {/* What applying MADE, with the way to it (owner, 2026-10-07: "the
          result is absolutely visible, and there's a link"). */}
      {isApplied ? <AppliedResult applied={applied} /> : null}

      {/* Resolved-entity chips */}
      <div className="flex flex-wrap gap-1.5">
        {chipsFor(action, t).map((c, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded border bg-good-wash px-2 py-0.5 text-xs"
          >
            <span className="text-muted-foreground">{c.label}:</span>
            <span className="font-medium">{c.value}</span>
          </span>
        ))}
      </div>

      {/* Open-slot pickers */}
      {!isApplied && slots.length > 0 ? (
        <div className="flex flex-col gap-2">
          {slots.map((slot) => (
            <label key={slot.key} className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">
                {t(`slot_${slot.key}`)}
                {slot.optional ? ` (${t("optional")})` : ""}
              </span>
              <select
                value={picks[slot.key] ?? ""}
                onChange={(e) => onPick(slot.key, e.target.value)}
                className="border-rule bg-surface h-9 rounded-md border px-2 text-sm"
              >
                <option value="">{t("pickPlaceholder")}</option>
                {slot.kind === "customer" ? (
                  <>
                    {/* Close spellings of what was said first — a transcript
                        garbles names; the person decides (2026-10-01). */}
                    {suggestedCustomers.length > 0 ? (
                      <optgroup label={t("customerSuggested")}>
                        {suggestedCustomers.map((v) => (
                          <option key={`s-${v.id}`} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    <optgroup label={t("customerAll")}>
                      {customers.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  vocabFor(slot.kind).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))
                )}
              </select>
            </label>
          ))}
        </div>
      ) : null}

      {/* When: the model's reading, the person's to correct. Columns follow
          the space the CARD has, not the window — it also lives in the
          assistant's narrow floating panel. */}
      {!isApplied && isEvent ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">{t("visitDate")}</span>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => onPick("date", e.target.value)}
              className="border-rule bg-surface h-9 rounded-md border px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">
              {t("visitTime")}
              {eventTime ? "" : ` · ${t("allDay")}`}
            </span>
            <input
              type="time"
              value={eventTime}
              onChange={(e) => onPick("time", e.target.value)}
              className="border-rule bg-surface h-9 rounded-md border px-2 text-sm"
            />
          </label>
          {eventTime ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">{t("visitDuration")}</span>
              <select
                value={picks.duration ?? String(action.type === "draft_event" ? (action.durationMinutes ?? spec?.defaultMinutes) : "")}
                onChange={(e) => onPick("duration", e.target.value)}
                className="border-rule bg-surface h-9 rounded-md border px-2 text-sm"
              >
                {[15, 30, 60, 90, 120, 180, 240].map((m) => (
                  <option key={m} value={String(m)}>
                    {t("visitMinutes", { m })}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {!isApplied ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={apply} disabled={!canApply || pending}>
            {pending ? t("applying") : t("apply")}
          </Button>
          {waitsForCustomer ? (
            <span className="text-muted-foreground text-xs">
              {t("applyCustomerFirst")}
            </span>
          ) : null}
          {eventMissingDate ? (
            <span className="text-muted-foreground text-xs">{t("visitPickDate")}</span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The result of an applied suggestion, in words, linking to what was made:
 * the draft order, the ticket, the customer — or, for a calendar entry, the
 * calendar scrolled to it. Reads the ledger row's payload, which every writer
 * fills with the number or date a person recognises.
 */
function AppliedResult({ applied }: { applied: AppliedRow | undefined }) {
  const t = useTranslations("inboxCommand");
  const locale = useLocale();
  const p = (applied?.payload ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const table = applied?.entityTable ?? null;
  const id = applied?.entityId ?? null;

  let text: string;
  let href: string | null = null;
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
    text = t("resultCalendar", { kind: t(`type_draft_event_${kind}`), when: time ? `${day}, ${time}` : day });
    // Past entries live on the calendar's other tab.
    const past = date !== null && date < new Date().toISOString().slice(0, 10);
    if (eventId) {
      const q = new URLSearchParams({ event: eventId });
      if (past) q.set("when", "past");
      href = `/calendar?${q.toString()}#ev-${eventId}`;
    } else {
      href = "/calendar";
    }
  } else if (table === "purchase_orders") {
    const pos = Array.isArray(p.pos) ? (p.pos as { number?: string }[]) : [];
    text = t("resultPurchaseOrders", { numbers: pos.map((po) => po.number).filter(Boolean).join(", ") || "—" });
    href = id ? `${ENTITY_PATH.purchase_orders}/${id}` : null;
  } else if (table && table in ENTITY_PATH) {
    const label = str(p.number) ?? str(p.legalName) ?? "";
    text = t(`result_${table}`, { label });
    href = id ? `${ENTITY_PATH[table]}/${id}` : null;
  } else {
    // A second press that lost the race, or a row written before its link.
    text = t("applied");
  }

  return (
    <p className="text-good flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Check className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">{text}</span>
      {href ? (
        <Link href={href} className="text-brand-ink inline-flex items-center gap-1 underline underline-offset-2">
          {t(table === "calendar_events" ? "resultOpenCalendar" : "resultOpen")}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </p>
  );
}

/** One-line human summary of what the action will draft. */
function ActionSummary({ action, modelLabel }: { action: CommandAction; modelLabel: string | null }) {
  const t = useTranslations("inboxCommand");
  if (action.type === "draft_customer") {
    return <p className="text-sm font-medium">{action.legalName}</p>;
  }
  if (action.type === "draft_offer") {
    return (
      <p className="text-sm">
        {t("offerSummary", {
          qty: action.quantity,
          model: modelLabel ?? t("modelPending"),
        })}
      </p>
    );
  }
  if (action.type === "draft_ticket") {
    return <p className="text-sm">{action.description}</p>;
  }
  if (action.type === "draft_event") {
    return <p className="text-sm font-medium">{action.title}</p>;
  }
  if (action.type === "draft_sales_order") {
    return (
      <p className="text-sm">
        {t("soSummary", {
          qty: action.quantity,
          model: modelLabel ?? t("modelPending"),
        })}
        {action.deliveryDate ? ` · ${action.deliveryDate}` : ""}
      </p>
    );
  }
  return (
    <ul className="text-sm">
      {action.items.map((it, i) => (
        <li key={i}>
          {it.quantity} × {it.partLabel}
        </li>
      ))}
    </ul>
  );
}

/** Resolved references to show as emerald chips. Labels + the new-customer
 *  marker are localized (the values are grounded data). */
function chipsFor(
  action: CommandAction,
  t: (key: string) => string,
): { label: string; value: string }[] {
  const chips: { label: string; value: string }[] = [];
  if (action.type === "draft_customer") {
    if (action.segmentLabel) chips.push({ label: t("chip_segment"), value: action.segmentLabel });
  }
  if (action.type === "draft_offer") {
    // A chip only for a CONFIRMED customer; an unconfirmed name is the
    // "Which customer?" slot's job, not a chip that looks settled.
    if (action.organizationId && action.organizationLabel) {
      chips.push({ label: t("chip_customer"), value: action.organizationLabel });
    } else if (action.organizationFromNewCustomer) {
      chips.push({ label: t("chip_customer"), value: t("newCustomerMarker") });
    }
    if (action.templateLabel) chips.push({ label: t("chip_model"), value: action.templateLabel });
    if (action.colorLabel) chips.push({ label: t("chip_colour"), value: action.colorLabel });
    if (action.note) chips.push({ label: t("chip_note"), value: action.note });
  }
  if (action.type === "draft_event") {
    if (action.organizationId && action.organizationLabel) chips.push({ label: t("chip_customer"), value: action.organizationLabel });
    if (action.location) chips.push({ label: t("chip_place"), value: action.location });
  }
  if (action.type === "draft_ticket" && action.urgency === "high") {
    chips.push({ label: t("chip_urgency"), value: t("urgencyHigh") });
  }
  if (action.type === "draft_sales_order") {
    if (action.organizationId && action.organizationLabel) {
      chips.push({ label: t("chip_customer"), value: action.organizationLabel });
    } else if (action.organizationFromNewCustomer) {
      chips.push({ label: t("chip_customer"), value: t("newCustomerMarker") });
    }
    if (action.templateLabel) chips.push({ label: t("chip_model"), value: action.templateLabel });
    if (action.colorLabel) chips.push({ label: t("chip_colour"), value: action.colorLabel });
    if (action.productionNote) chips.push({ label: t("chip_note"), value: action.productionNote });
  }
  return chips;
}
