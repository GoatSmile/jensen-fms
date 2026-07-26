import Link from "next/link";
import { getTranslations } from "next-intl/server";

import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@/lib/admin/settings-sections";
import { cn } from "@/lib/utils";

import { SubRailScroller } from "./subrail-scroller";

const HUE_DOT: Record<string, string> = {
  brand: "bg-brand",
  money: "bg-money",
  good: "bg-good",
  alert: "bg-alert",
  buy: "bg-buy",
  system: "bg-system",
};

/**
 * Left rail for `/admin/settings` — a server component, so the active section
 * is correct on the first frame and there is nothing to hydrate.
 *
 * `scroll={false}` matters: without it, switching sections jumps the viewport
 * to the top of the document, which on a settings page reads as the page
 * reloading rather than as a panel swapping.
 *
 * Below `md` the rail becomes a horizontal scroller above the panel, because a
 * vertical rail plus a form in a phone-width column leaves neither enough room.
 */
export async function SettingsSubRail({
  active,
}: {
  active: SettingsSectionId;
}) {
  const t = await getTranslations("adminSettings");
  return (
    <nav aria-label={t("sectionsAria")} className="md:w-52 md:shrink-0">
      <SubRailScroller>
        <ul className="flex gap-1 md:flex-col">
          {SETTINGS_SECTIONS.map((section) => {
            const isActive = section.id === active;
            return (
              <li key={section.id} className="shrink-0 md:shrink">
                <Link
                  href={`/admin/settings?section=${section.id}`}
                  scroll={false}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors md:w-full",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-ink-2 hover:bg-ink/5 hover:text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      HUE_DOT[section.hue],
                      isActive ? null : "opacity-40",
                    )}
                    aria-hidden
                  />
                  {t(section.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </SubRailScroller>
    </nav>
  );
}
