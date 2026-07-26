import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { HUE_FILL, type PanelHue } from "@/components/ui/panel";

export type MetricProps = {
  /** Keep the string sentence-case — the ALL CAPS is a CSS design token. */
  label: string;
  value: string | number;
  hint?: string | null;
  href?: string;
  hue?: PanelHue;
  className?: string;
};

/**
 * A single figure — the replacement for the boxed four-across KPI tile.
 *
 * The old `StatCard` was `rounded-lg border p-4`, and a row of four of them
 * with ALL-CAPS eyebrows is the most dated pattern in business software: it
 * says "executive dashboard, 2014" louder than anything else on a screen.
 * B keeps the figure and the eyebrow (both genuinely legible, and the caps
 * are a documented token) but drops the border for a flat domain wash, so
 * the row reads as coloured information rather than as four boxes.
 *
 * `hue` is explicit rather than positional — the mock-up coloured metrics by
 * nth-child, which would silently reassign meanings the moment a tile was
 * inserted or reordered.
 */
export function Metric({
  label,
  value,
  hint,
  href,
  hue,
  className,
}: MetricProps) {
  const inner = (
    <div
      className={cn(
        "flex h-full flex-col justify-between rounded-lg px-5 py-4 transition-colors",
        hue ? HUE_FILL[hue] : "bg-surface",
        href ? "hover:brightness-[0.98]" : null,
        className,
      )}
    >
      <span className="text-ink-2 mb-2 block text-[10.5px] font-bold uppercase tracking-[0.08em]">
        {label}
      </span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-[1.8rem] font-bold leading-none tracking-[-0.03em] tabular-nums">
          {value}
        </span>
        {href ? (
          <ArrowUpRight className="text-ink-3 size-4 shrink-0" aria-hidden />
        ) : null}
      </div>
      {hint ? (
        <span className="text-ink-3 mt-1.5 block text-xs leading-snug">
          {hint}
        </span>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}
