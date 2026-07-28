import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Action = {
  label: string;
  href: string;
};

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Primary CTA. */
  action?: Action;
  /** Secondary CTA, rendered as outline next to primary. */
  secondaryAction?: Action;
  /**
   * Set when this sits INSIDE a `Panel`. The panel already draws the surface,
   * so the dashed box would be the boxed-thing-in-a-box the panel replaced;
   * fill with `bg-ground` instead. Do NOT set it at page level — the page
   * background already is `--ground`, so the fill renders as nothing and the
   * state reads as floating text (CLAUDE.md).
   */
  inPanel?: boolean;
  className?: string;
};

/**
 * Placeholder shown when a list page has no rows. Friendlier than a
 * one-line "Nothing here yet." and gives the user a way forward.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  inPanel = false,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        inPanel ? "bg-ground rounded-lg" : "rounded-md border border-dashed",
        className,
      )}
    >
      {Icon ? (
        <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-md">
          <Icon aria-hidden className="size-5" />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="text-muted-foreground max-w-md text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="mt-2 flex gap-2">
          {action ? (
            <Button asChild>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button asChild variant="outline">
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
