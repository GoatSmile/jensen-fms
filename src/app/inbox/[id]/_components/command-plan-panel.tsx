"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Play, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CommandAction, CommandPlan } from "@/lib/inbound/command/plan";
import { openSlotsFor } from "@/lib/inbound/command/plan";

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
};

const ENTITY_PATH: Record<string, string> = {
  organizations: "/organizations",
  sales_orders: "/sales-orders",
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
}: Props) {
  const t = useTranslations("inboxCommand");
  const router = useRouter();
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
      router.refresh();
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="text-muted-foreground size-4" aria-hidden />
          <h2 className="text-sm font-semibold">{t("planTitle")}</h2>
        </div>
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
      </div>

      {plan.summary ? (
        <p className="text-muted-foreground rounded-md border bg-muted/30 p-3 text-sm">
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
    </section>
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
}) {
  const t = useTranslations("inboxCommand");
  const router = useRouter();
  const [pending, start] = useTransition();

  const slots = openSlotsFor(action);
  const requiredUnfilled = slots.some((s) => !s.optional && !picks[s.key]);
  // A sales order that references a not-yet-created customer must wait.
  const waitsForCustomer =
    action.type === "draft_sales_order" &&
    !action.organizationId &&
    action.organizationFromNewCustomer &&
    !customerApplied;

  const isApplied = Boolean(applied?.entityId) || Boolean(applied);
  const canApply = !isApplied && !requiredUnfilled && !waitsForCustomer;

  function apply() {
    onError(null);
    start(async () => {
      const r = await applyCommandAction(messageId, action.id, picks);
      if (!r.ok) return onError(r.error);
      router.refresh();
    });
  }

  const vocabFor = (kind: string): VocabItem[] =>
    kind === "template" ? templates : kind === "segment" ? segments : colors;

  const appliedPath =
    applied?.entityTable && applied.entityId
      ? `${ENTITY_PATH[applied.entityTable] ?? ""}/${applied.entityId}`
      : null;

  return (
    <li
      className={cn(
        "flex flex-col gap-2.5 rounded-md border p-3.5",
        isApplied
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
          : "bg-background",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          {t(`type_${action.type}`)}
        </span>
        {isApplied ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
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
            className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs dark:border-emerald-800 dark:bg-emerald-950/40"
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
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
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
