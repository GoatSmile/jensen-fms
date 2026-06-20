import { ralToHex } from "@/lib/colors/ral";
import { cn } from "@/lib/utils";

type Props = {
  hex: string | null | undefined;
  /** RAL classic code (e.g. "5013"); resolved to an sRGB approximation when
   * no explicit hex is set, so RAL-only colours still show a real swatch. */
  ralCode?: string | null;
  label?: string | null;
  /** Size in tailwind units. Default 3 (12px). */
  size?: number;
  className?: string;
};

/**
 * Round colour swatch — used inline next to a colour name, and inside
 * Select dropdowns. RAL is the source of truth for colour, so a recognised
 * RAL code wins; we fall back to the explicit hex (for custom, non-RAL
 * colours or unrecognised codes), then to a neutral grey ring when neither
 * is known.
 */
export function ColorSwatch({ hex, ralCode, label, size = 3, className }: Props) {
  const safe = ralToHex(ralCode) ?? (isValidHex(hex) ? hex! : null);
  const sizeClass = sizeToClass(size);
  return (
    <span
      aria-hidden={label == null}
      role={label == null ? undefined : "img"}
      aria-label={label ?? undefined}
      className={cn(
        "ring-border/60 inline-block shrink-0 rounded-full ring-1 ring-inset",
        sizeClass,
        className,
      )}
      style={safe ? { backgroundColor: safe } : undefined}
      data-color-fallback={safe == null ? "true" : undefined}
    />
  );
}

/**
 * Swatch + label combo, the typical inline use.
 */
export function ColorChip({
  hex,
  ralCode,
  label,
  className,
}: {
  hex: string | null | undefined;
  ralCode?: string | null;
  label: string | null | undefined;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <ColorSwatch hex={hex} ralCode={ralCode} label={label} />
      <span>{label ?? "—"}</span>
    </span>
  );
}

function isValidHex(s: string | null | undefined): s is string {
  return !!s && /^#[0-9a-fA-F]{3,8}$/.test(s);
}

function sizeToClass(n: number): string {
  // Tailwind doesn't ship every arbitrary size; pin to a handful.
  switch (n) {
    case 2:
      return "size-2";
    case 2.5:
      return "size-2.5";
    case 3:
      return "size-3";
    case 4:
      return "size-4";
    case 5:
      return "size-5";
    case 6:
      return "size-6";
    default:
      return "size-3";
  }
}
