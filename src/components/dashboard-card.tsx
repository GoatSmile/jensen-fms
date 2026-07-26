import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import { Panel, type PanelHue } from "@/components/ui/panel";

// `StatCard` used to live here as a bordered KPI tile. It turned out to have
// no callers anywhere in the app (the 4-up rows on part detail and settings
// hand-roll their own), so it is deleted rather than ported — `Metric` in
// components/ui/metric.tsx is the replacement for new work.

type PipelineStage = {
  label: string;
  value: string | number;
  href: string;
  /** Small line under the value, e.g. a DKK sum. */
  hint?: string | null;
};

/**
 * Pipeline strip — a titled panel showing a left-to-right flow of stage
 * counts (build: planning → building → …). Zeros stay visible: "nothing in
 * build" is daily signal, unlike an empty attention list.
 */
export function PipelineCard({
  title,
  stages,
  hue,
}: {
  title: string;
  stages: PipelineStage[];
  hue?: PanelHue;
}) {
  return (
    <Panel title={title} hue={hue} className="h-full">
      <div className="flex items-start">
        {stages.map((stage, i) => (
          <React.Fragment key={stage.label}>
            {i > 0 ? (
              <span
                className="text-ink-3 mt-1.5 shrink-0 px-1 text-sm"
                aria-hidden
              >
                →
              </span>
            ) : null}
            <Link
              href={stage.href}
              className="-my-1 flex min-w-0 flex-1 flex-col rounded-sm px-1.5 py-1 transition-colors hover:brightness-[0.97]"
            >
              <span className="text-2xl font-bold tracking-[-0.02em] tabular-nums">
                {stage.value}
              </span>
              <span className="text-ink-2 text-xs leading-tight">
                {stage.label}
              </span>
              {stage.hint ? (
                <span className="text-ink-3 text-[11px] tabular-nums">
                  {stage.hint}
                </span>
              ) : null}
            </Link>
          </React.Fragment>
        ))}
      </div>
    </Panel>
  );
}

type AttentionProps = {
  title: string;
  emptyMessage: string;
  /** Optional "see all" link in the header. */
  viewAllHref?: string;
  viewAllLabel?: string;
  /**
   * Which domain this card is about — drives the wash WHILE THERE ARE ITEMS.
   * An all-clear is good news whatever the subject, so the empty state drops
   * the wash entirely rather than rendering "Every open MO is on schedule."
   * inside a red block. (This is the same bug the old `tone` prop shipped: it
   * coloured the empty message, so all-clears appeared in alarm colours.)
   */
  hue?: PanelHue;
  children: React.ReactNode;
};

/**
 * "Needs attention" panel — header + list of items, or an all-clear.
 */
export function AttentionCard({
  title,
  emptyMessage,
  viewAllHref,
  viewAllLabel,
  hue,
  children,
}: AttentionProps) {
  const t = useTranslations("dashboard");
  const hasChildren = React.Children.count(children) > 0;
  return (
    <Panel
      title={title}
      hue={hasChildren ? hue : undefined}
      className="h-full"
      action={
        viewAllHref && hasChildren ? (
          <Link
            href={viewAllHref}
            className="text-ink-2 hover:text-ink text-xs underline-offset-4 hover:underline"
          >
            {viewAllLabel ?? t("viewAll")}
          </Link>
        ) : undefined
      }
    >
      {hasChildren ? (
        <ul className="flex flex-col gap-1.5">{children}</ul>
      ) : (
        <p className="text-ink-2 flex items-start gap-1.5 text-xs">
          <Check className="text-good mt-px size-3.5 shrink-0" aria-hidden />
          {emptyMessage}
        </p>
      )}
    </Panel>
  );
}
