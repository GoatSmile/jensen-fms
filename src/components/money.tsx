import { cn } from "@/lib/utils";

/**
 * Renders a money amount with the øre (fractional krone) and currency
 * suffix dimmed so the eye lands on the whole-krone value first. The
 * Danish locale formats as `1.234,56 kr.` — we split at the decimal
 * comma and mute everything after it.
 *
 * Currency-agnostic: works for USD ($1,234.56), EUR (€1.234,56),
 * etc. The whole/fraction split follows the locale's decimal
 * separator, so the same component renders correctly across the
 * codebase's supported currencies.
 *
 * Falls back to a plain "—" when the amount is null or non-finite —
 * matches the muted-foreground "no data" treatment the rest of the
 * app uses for missing prices.
 */
export function Money({
  amount,
  currency,
  className,
  bold = true,
  fractionDigits = 2,
}: {
  amount: number | string | null | undefined;
  currency?: string | null;
  className?: string;
  /** When false, the whole-krone part renders at normal weight (still
   *  contrasted against the dim fraction). Useful inside already-bold
   *  contexts like total rows. */
  bold?: boolean;
  /** Override the fractional precision. PO line unit prices use 4 to
   *  preserve the supplier's quoted øre; everything else defaults to 2. */
  fractionDigits?: number;
}) {
  if (amount == null) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }

  // Danish locale by default. Currency code controls the suffix.
  const locale = "da-DK";
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency ?? "DKK",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);

  // Find the locale's decimal separator (`,` for da-DK, `.` for en-US).
  // We can't hardcode `,` because the same formatter would behave
  // differently in another locale; deriving it from a known sample
  // keeps the split robust.
  const sample = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
  }).format(1.1);
  const sep = sample.replace(/[0-9]/g, "")[0] ?? ",";

  const idx = formatted.lastIndexOf(sep);
  if (idx < 0) {
    // No fractional part — render unstyled.
    return (
      <span className={cn("tabular-nums", className)}>{formatted}</span>
    );
  }

  const whole = formatted.slice(0, idx + 1); // include the separator
  const fraction = formatted.slice(idx + 1);

  return (
    <span className={cn("tabular-nums", className)}>
      <span className={bold ? "font-semibold" : undefined}>{whole}</span>
      <span className="text-muted-foreground">{fraction}</span>
    </span>
  );
}
