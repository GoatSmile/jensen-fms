import { cn } from "@/lib/utils";

/**
 * A hairline separator, for dividing content INSIDE a panel — a run of rows,
 * a totals line under a table.
 *
 * Deliberately not a general-purpose page divider: in Direction B, sections
 * are separated by a change of fill and by space, not by lines. Reaching for
 * a Rule between two panels is a sign the panels want merging.
 */
export function Rule({ className }: { className?: string }) {
  return <hr className={cn("border-rule my-3 border-t", className)} />;
}
