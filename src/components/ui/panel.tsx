import { cn } from "@/lib/utils";

/**
 * The six-hue vocabulary from CLAUDE.md. A panel's hue says what KIND of
 * thing it is, and the meaning is fixed app-wide — see the table there
 * before reaching for one. `undefined` is the common case: a plain surface
 * panel, which is what homogeneous pages should use. Colour is only
 * meaningful while it's scarce.
 */
export const PANEL_HUES = [
  "brand",
  "money",
  "good",
  "alert",
  "buy",
  "system",
] as const;

export type PanelHue = (typeof PANEL_HUES)[number];

/** Block fill for a hue. Exported so every washed surface uses one map. */
export const HUE_FILL: Record<PanelHue, string> = {
  brand: "bg-brand-wash",
  money: "bg-money-wash",
  good: "bg-good-wash",
  alert: "bg-alert-wash",
  buy: "bg-buy-wash",
  system: "bg-system-wash",
};

/**
 * The title takes the hue at full strength on its wash. Every one of these
 * pairs is measured >= 4.5:1 in both themes — a 12px bold uppercase title is
 * NOT WCAG "large text", so it needs the full ratio, not 3:1.
 */
export const HUE_TITLE: Record<PanelHue, string> = {
  brand: "text-brand-ink",
  money: "text-money",
  good: "text-good",
  alert: "text-alert",
  buy: "text-buy",
  system: "text-system",
};

export type PanelProps = {
  title?: string;
  description?: string;
  /** Right-aligned header slot — a link or a button. */
  action?: React.ReactNode;
  /** Domain fill. Omit for a plain surface panel. */
  hue?: PanelHue;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
};

/**
 * Direction B's surface primitive: a flat colour block with generous padding
 * and NO border.
 *
 * This replaces the `rounded-md border bg-background` box that was
 * copy-pasted 345 times across 187 files. That "card soup" is the single
 * biggest reason the old UI read as 2015 enterprise software — when every
 * element is boxed, nothing is emphasised and the eye has no entry point.
 * Separation here comes from the fill and the padding instead, which is why
 * the page ground is #FBFBF9 rather than white: a plain white panel still
 * reads as raised without needing a hairline around it.
 */
export function Panel({
  title,
  description,
  action,
  hue,
  className,
  contentClassName,
  children,
}: PanelProps) {
  return (
    <section
      data-hue={hue}
      className={cn(
        "rounded-lg p-5",
        hue ? HUE_FILL[hue] : "bg-surface",
        className,
      )}
    >
      {title || action ? (
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <div className="flex flex-col gap-1">
            {title ? (
              <h2
                className={cn(
                  "text-xs font-bold uppercase tracking-[0.075em]",
                  hue ? HUE_TITLE[hue] : "text-ink-2",
                )}
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-ink-2 text-xs normal-case">{description}</p>
            ) : null}
          </div>
          {action ?? null}
        </header>
      ) : null}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
