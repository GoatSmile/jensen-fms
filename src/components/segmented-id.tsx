import { cn } from "@/lib/utils";

/**
 * Renders a hyphen-segmented mono identifier with the boilerplate
 * prefix dimmed and the trailing serial in normal weight. Splits at
 * the LAST hyphen — everything up to and including it is the muted
 * context (`JP-2026-E_BIKE-`), the trailing chunk is the unique part
 * the eye should land on (`001`).
 *
 * Examples:
 *   JP-2026-E_BIKE-001  → dim "JP-2026-E_BIKE-",  bold "001"
 *   TKT-2026-0004       → dim "TKT-2026-",        bold "0004"
 *   WO-2026-0008        → dim "WO-2026-",         bold "0008"
 *   FRAME#TEST 33       → no hyphen — rendered as a single span
 *
 * Hyphens stay visible (kept on the dim side) by design — the user
 * asked for dashes to remain part of the layout cue.
 *
 * Use this on medium-sized renderings (text-sm and up) where the
 * weight contrast is visible. Skip it on tiny 10 px eyebrow stamps
 * — the contrast doesn't read at that size.
 */
export function SegmentedId({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  const lastDash = value.lastIndexOf("-");
  if (lastDash <= 0 || lastDash === value.length - 1) {
    // No usable split — render unstyled mono so callers don't get a
    // surprise empty bold span.
    return <span className={cn("font-mono", className)}>{value}</span>;
  }
  const prefix = value.slice(0, lastDash + 1);
  const tail = value.slice(lastDash + 1);
  return (
    <span className={cn("font-mono", className)}>
      <span className="text-muted-foreground">{prefix}</span>
      <span>{tail}</span>
    </span>
  );
}
