import { Badge } from "@/components/ui/badge";
import { kitCode, stickerColor } from "@/lib/kits/colors";
import { formatQuantity } from "@/lib/parts/stock";

export type PickRow = {
  sku: string;
  name: string;
  quantity: number;
  /** Other kit labels this part carries — shown as a hint, never re-listed. */
  also: Array<{ sticker_color: string; kit_number: number }>;
};

export type PickGroup = {
  sticker_color: string;
  kit_number: number;
  /** Every live part of the kit is on this bike — grab the whole sticker code. */
  complete: boolean;
  totalKitParts: number;
  presentKitParts: number;
  rows: PickRow[];
};

/**
 * Read-only picking aid: the bike's parts grouped by kit sticker code, so
 * the assembler shops the shelves by colour+number. "Whole kit" means every
 * box with that sticker; partial groups list exactly which boxes to pull.
 * Server-rendered; passed into the client workbench as a slot.
 */
export function PickList({
  groups,
  loose,
}: {
  groups: PickGroup[];
  loose: PickRow[];
}) {
  return (
    <section className="rounded-md border">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Pick list by kit</h2>
        <p className="text-muted-foreground text-xs">
          Shop the shelves by sticker code, then assemble. Parts with several
          labels are listed once.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const colour = stickerColor(g.sticker_color);
          const code = kitCode(g.sticker_color, g.kit_number);
          return (
            <div key={code} className="overflow-hidden rounded-md border">
              <div
                className="flex items-center justify-between gap-2 px-3 py-2"
                style={{ backgroundColor: colour.hex, color: colour.fg }}
              >
                <span className="text-sm font-bold tracking-wide">{code}</span>
                <Badge
                  variant={g.complete ? "success" : "warning"}
                  className="shrink-0"
                >
                  {g.complete
                    ? `whole kit (${g.totalKitParts})`
                    : `${g.presentKitParts} of ${g.totalKitParts} — pick by list`}
                </Badge>
              </div>
              <ul className="divide-y text-sm">
                {g.rows.map((r) => (
                  <li key={r.sku} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate">{r.name}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {r.sku}
                        {r.also.length > 0 ? (
                          <span className="ml-1.5 font-sans">
                            also {r.also.map((a) => kitCode(a.sticker_color, a.kit_number)).join(", ")}
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
            </div>
          );
        })}

        {loose.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-dashed">
            <div className="bg-muted/40 flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm font-bold tracking-wide">
                Loose parts
              </span>
              <Badge variant="outline" className="shrink-0">
                no sticker
              </Badge>
            </div>
            <ul className="divide-y text-sm">
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
