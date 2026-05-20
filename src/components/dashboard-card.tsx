import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type StatProps = {
  label: string;
  value: string | number;
  hint?: string | null;
  href?: string;
  icon?: LucideIcon;
  className?: string;
};

/**
 * Compact KPI tile — number + label, optional hint underneath, optional link.
 * Used in the dashboard hero row.
 */
export function StatCard({
  label,
  value,
  hint,
  href,
  icon: Icon,
  className,
}: StatProps) {
  const inner = (
    <div
      className={cn(
        "flex h-full flex-col justify-between gap-3 rounded-lg border p-4 transition-colors",
        href ? "hover:border-foreground/40" : null,
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
        {Icon ? (
          <Icon className="text-muted-foreground size-4" aria-hidden />
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {href ? (
          <ArrowUpRight className="text-muted-foreground size-4" aria-hidden />
        ) : null}
      </div>
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

type AttentionProps = {
  title: string;
  emptyMessage: string;
  /** Optional "see all" link in the header. */
  viewAllHref?: string;
  viewAllLabel?: string;
  /** Tone affects the empty-state coloring — success when nothing's wrong. */
  tone?: "neutral" | "warning" | "destructive";
  children: React.ReactNode;
};

/**
 * "Needs attention" tile — header + list of items (or empty-state).
 */
export function AttentionCard({
  title,
  emptyMessage,
  viewAllHref,
  viewAllLabel,
  tone = "neutral",
  children,
}: AttentionProps) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <section className="flex h-full flex-col gap-3 rounded-lg border p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {viewAllHref && hasChildren ? (
          <Link
            href={viewAllHref}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            {viewAllLabel ?? "View all"}
          </Link>
        ) : null}
      </header>
      {hasChildren ? (
        <ul className="flex flex-col gap-1.5">{children}</ul>
      ) : (
        <p
          className={cn(
            "text-xs",
            tone === "destructive" && "text-destructive",
            tone === "warning" && "text-amber-700 dark:text-amber-400",
            tone === "neutral" && "text-muted-foreground",
          )}
        >
          {emptyMessage}
        </p>
      )}
    </section>
  );
}
