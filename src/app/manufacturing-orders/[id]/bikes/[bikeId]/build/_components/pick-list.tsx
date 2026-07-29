import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { kitCode, stickerColor } from "@/lib/kits/colors";
import { formatQuantity } from "@/lib/parts/stock";

export type PickRow = {
  sku: string;
  name: string;
  quantity: number;
  /** Other kit labels this part carries — shown as a hint, never re-listed. */
  also: Array<{ sticker_color: string; kit_number: number | null }>;
};

export type PickGroup = {
  sticker_color: string;
  kit_number: number | null;
  /** Every live part of the kit is on this bike — grab the whole sticker code. */
  complete: boolean;
  totalKitParts: number;
  presentKitParts: number;
  rows: PickRow[];
};

/**
 * Read-only picking aid: the bike's parts grouped by kit sticker code, so
 * the assembler shops the shelves by colour+number. Each bucket is collapsed
 * by default (native <details> — no client JS) and unfurls on click, so the
 * page opens compact. "Whole kit" means every box with that sticker; partial
 * groups list exactly which boxes to pull. Server-rendered; slotted into the
 * client workbench.
 */
export function PickList({
  groups,
  loose,
  printHref,
}: {
  groups: PickGroup[];
  loose: PickRow[];
  /** When set, a "Print" link in the header opens the printable pick sheet. */
  printHref?: string;
}) {
  const t = useTranslations("build");
  return (
    <Panel
      title={t("pickListTitle")}
      description={t("pickListHint")}
      action={
        printHref ? (
          <Link
            href={printHref}
            target="_blank"
            className="text-ink-2 hover:text-ink inline-flex items-center gap-1.5 text-xs underline underline-offset-4"
          >
            <Printer aria-hidden className="size-3.5" /> {t("printRecipe")}
          </Link>
        ) : null
      }
      contentClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
        {groups.map((g) => {
          const colour = stickerColor(g.sticker_color);
          const code = kitCode(g.sticker_color, g.kit_number);
          return (
            <details
              key={code}
              className="bg-ground group overflow-hidden rounded-lg"
            >
              <summary
                className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden"
                style={{ backgroundColor: colour.hex, color: colour.fg }}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 transition-transform group-open:rotate-180"
                  />
                  <span className="text-sm font-bold tracking-wide">{code}</span>
                </span>
                <Badge
                  variant={g.complete ? "success" : "warning"}
                  className="shrink-0"
                >
                  {g.complete
                    ? t("wholeKit", { count: g.totalKitParts })
                    : t("partialKit", {
                        present: g.presentKitParts,
                        total: g.totalKitParts,
                      })}
                </Badge>
              </summary>
              <ul className="divide-y border-t text-sm">
                {g.rows.map((r) => (
                  <li key={r.sku} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate">{r.name}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {r.sku}
                        {r.also.length > 0 ? (
                          <span className="ml-1.5 font-sans">
                            {t("alsoLabel", {
                              codes: r.also
                                .map((a) => kitCode(a.sticker_color, a.kit_number))
                                .join(", "),
                            })}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      ×{formatQuantity(r.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}

        {loose.length > 0 ? (
          <details className="bg-ground group overflow-hidden rounded-lg">
            <summary className="bg-rule/40 flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-1.5">
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 transition-transform group-open:rotate-180"
                />
                <span className="text-sm font-bold tracking-wide">
                  {t("looseParts")}
                </span>
              </span>
              <Badge variant="outline" className="shrink-0">
                {t("noSticker")}
              </Badge>
            </summary>
            <ul className="divide-y border-t text-sm">
              {loose.map((r) => (
                <li key={r.sku} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate">{r.name}</span>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {r.sku}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    ×{formatQuantity(r.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
    </Panel>
  );
}
