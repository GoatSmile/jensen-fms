import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SubRailScroller } from "@/components/subrail-scroller";
import { VOCABULARIES, type VocabId } from "@/lib/admin/vocabularies";
import { cn } from "@/lib/utils";

const HUE_DOT: Record<string, string> = {
  brand: "bg-brand",
  money: "bg-money",
  good: "bg-good",
  alert: "bg-alert",
  buy: "bg-buy",
  system: "bg-system",
};

/**
 * Vocabulary rail for `/admin/lists` — deliberately the same shape as
 * `SettingsSubRail`: a server component, so the active vocabulary is correct on
 * the first frame and there is nothing to hydrate, and `scroll={false}` so
 * switching swaps the panel rather than jumping the viewport to the top (which
 * reads as a page reload).
 *
 * Not merged with `SettingsSubRail` into one generic rail: they share ~20 lines
 * of markup but differ in route, param name and label namespace, and a rail
 * abstracted over all three is harder to read than two short components. The
 * duplication worth removing was the scroller, and that is now shared.
 */
export async function VocabSubRail({ active }: { active: VocabId }) {
  const t = await getTranslations("adminLists");
  return (
    <nav aria-label={t("vocabulariesAria")} className="md:w-52 md:shrink-0">
      <SubRailScroller>
        <ul className="flex gap-1 md:flex-col">
          {VOCABULARIES.map((vocab) => {
            const isActive = vocab.id === active;
            return (
              <li key={vocab.id} className="shrink-0 md:shrink">
                <Link
                  href={`/admin/lists?vocab=${vocab.id}`}
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
                      HUE_DOT[vocab.hue],
                      isActive ? null : "opacity-40",
                    )}
                    aria-hidden
                  />
                  {t(vocab.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </SubRailScroller>
    </nav>
  );
}
