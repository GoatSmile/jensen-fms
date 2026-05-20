import { cn } from "@/lib/utils";

type Props = {
  hex: string | null | undefined;
  label?: string | null;
  /** Size in tailwind units. Default 3 (12px). */
  size?: number;
  className?: string;
};

/**
 * Round colour swatch — used inline next to a colour name, and inside
 * Select dropdowns. Falls back to a neutral grey when no hex is known.
 */
export function ColorSwatch({ hex, label, size = 3, className }: Props) {
  const safe = isValidHex(hex) ? hex! : null;
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
  label,
  className,
}: {
  hex: string | null | undefined;
  label: string | null | undefined;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <ColorSwatch hex={hex} label={label} />
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
