"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Play, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import type { CommandAction, CommandPlan } from "@/lib/inbound/command/plan";
import { openSlotsFor } from "@/lib/inbound/command/plan";
import { CALENDAR_KIND_SPECS } from "@/lib/calendar/kinds";

import { applyCommandAction, rerunCommandAgent } from "../../_actions/command";

type VocabItem = { id: string; label: string };
type AppliedRow = { entityTable: string | null; entityId: string | null };

type Props = {
  messageId: string;
  plan: CommandPlan;
  /** command_actions already applied, keyed by plan_action_id. */
  applied: Record<string, AppliedRow>;
  templates: VocabItem[];
  segments: VocabItem[];
  colors: VocabItem[];
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
  // An entry lives in Google; the app's own view of it is the calendar list.
  calendar_events: "/calendar",
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
          {plan.actions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              applied={applied[action.id]}
              customerApplied={customerApplied}
              picks={picks[action.id] ?? {}}
              onPick={(key, value) => setPick(action.id, key, value)}
              templates={templates}
              segments={segments}
              colors={colors}
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
  applied,
  customerApplied,
  picks,
  onPick,
  templates,
  segments,
  colors,
  messageId,
  onError,
  onApplied,
}: {
  action: CommandAction;
  applied: AppliedRow | undefined;
  customerApplied: boolean;
  picks: Record<string, string>;
  onPick: (key: string, value: string) => void;
  templates: VocabItem[];
  segments: VocabItem[];
  colors: VocabItem[];
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
    !customerApplied;

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

  const vocabFor = (kind: string): VocabItem[] =>
    kind === "template" ? templates : kind === "segment" ? segments : colors;

  const appliedPath =
    applied?.entityTable === "calendar_events"
      ? ENTITY_PATH.calendar_events
      : applied?.entityTable && applied.entityId
        ? `${ENTITY_PATH[applied.entityTable] ?? ""}/${applied.entityId}`
        : null;

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
        {isApplied ? (
          <span className="inline-flex items-center gap-1 text-xs text-good">
            <Check className="size-3.5" aria-hidden />
            {appliedPath ? (
              <Link href={appliedPath} className="font-medium underline">
                {t("applied")}
              </Link>
            ) : (
              t("applied")
            )}
          </span>
        ) : null}
      </div>

      <ActionSummary action={action} />

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
                {vocabFor(slot.kind).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
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

/** One-line human summary of what the action will draft. */
function ActionSummary({ action }: { action: CommandAction }) {
  const t = useTranslations("inboxCommand");
  if (action.type === "draft_customer") {
    return <p className="text-sm font-medium">{action.legalName}</p>;
  }
  if (action.type === "draft_offer") {
    return (
      <p className="text-sm">
        {t("offerSummary", {
          qty: action.quantity,
          model: action.templateLabel ?? t("modelPending"),
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
          model: action.templateLabel ?? t("modelPending"),
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
    if (action.organizationLabel) {
      chips.push({ label: t("chip_customer"), value: action.organizationLabel });
    } else if (action.organizationFromNewCustomer) {
      chips.push({ label: t("chip_customer"), value: t("newCustomerMarker") });
    }
    if (action.templateLabel) chips.push({ label: t("chip_model"), value: action.templateLabel });
    if (action.colorLabel) chips.push({ label: t("chip_colour"), value: action.colorLabel });
    if (action.note) chips.push({ label: t("chip_note"), value: action.note });
  }
  if (action.type === "draft_event") {
    if (action.organizationLabel) chips.push({ label: t("chip_customer"), value: action.organizationLabel });
    if (action.location) chips.push({ label: t("chip_place"), value: action.location });
  }
  if (action.type === "draft_ticket" && action.urgency === "high") {
    chips.push({ label: t("chip_urgency"), value: t("urgencyHigh") });
  }
  if (action.type === "draft_sales_order") {
    if (action.organizationLabel) {
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
