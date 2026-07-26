import Image from "next/image";

import { cn } from "@/lib/utils";

type Props = {
  /** Tailwind height class. Width auto-derives from the aspect ratio. */
  heightClass?: string;
  className?: string;
};

/**
 * Jensen Kvalitetscykler logo. Source PNG from kommune-cykler.dk, kept as
 * webp in `public/`. The aspect ratio is ≈1.55:1; we always render at the
 * caller's chosen height with width auto so the lockup never distorts.
 *
 * Marked priority so the logo lands in the first paint — it's above the
 * fold on every page and there's exactly one instance in the navigation.
 */
export function Logo({ heightClass = "h-10", className }: Props) {
  return (
    <Image
      src="/logo-jensen.webp"
      alt="Ægte Jensen — Kvalitetscykler"
      width={283}
      height={183}
      priority
      className={cn(heightClass, "w-auto", className)}
    />
  );
}

/**
 * Square lettermark, for places too small for the lockup. The detailed
 * hand-drawn wordmark rendered ~20px tall in the mobile header and was
 * illegible — at that size the mark is the honest choice. Same asset the
 * PWA icons are generated from.
 */
export function LogoMark({ heightClass = "h-7", className }: Props) {
  return (
    <Image
      src="/icon-mark.svg"
      alt="Ægte Jensen — Kvalitetscykler"
      width={512}
      height={512}
      priority
      className={cn(heightClass, "w-auto rounded-sm", className)}
    />
  );
}
