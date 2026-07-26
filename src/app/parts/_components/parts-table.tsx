import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SegmentedId } from "@/components/segmented-id";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  STOCK_BADGE_VARIANT,
  formatDkk,
  formatQuantity,
  type StockStatus,
} from "@/lib/parts/stock";

import { kitCode, stickerColor } from "@/lib/kits/colors";

import { SortableHeader } from "./sortable-header";

/** Map a stock status to a per-row left-edge accent so low/out parts pop
 *  while scanning. The class targets the row's first cell so the colour
 *  appears as a 2px stripe down the leftmost column. */
function attentionBorder(status: StockStatus): string {
  switch (status) {
    case "out":
      return "shadow-[inset_3px_0_0_var(--destructive)]";
    case "low":
      return "shadow-[inset_3px_0_0_var(--color-chart-2)]";
    default:
      return "";
  }
}

export type PartRowKit = {
  sticker_color: string;
  kit_number: number | null;
};

export type PartRow = {
  id: string;
  internalSku: string;
  name: string;
  categoryName: string | null;
  supplierName: string | null;
  supplierCount: number;
  stockOnHand: number;
  /** Customer (retail) price in DKK; null when unset or non-DKK. */
  retailDkk: number | null;
  stockStatus: StockStatus;
  heroUrl: string | null;
  kits: PartRowKit[];
};

export async function PartsTable({ rows }: { rows: PartRow[] }) {
  const [t, tStock] = await Promise.all([
    getTranslations("parts"),
    getTranslations("stockStatus"),
  ]);
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
        {t("noMatch")}
      </div>
    );
  }

  return (
    // overflow-x-auto on mobile lets the user swipe sideways when a row
    // doesn't quite fit (long SKUs are stubborn mono strings); md+ has
    // room and we hide-overflow for the rounded corners.
    <div className="overflow-x-auto rounded-md border md:overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Thumb hidden on tiny phones to give Stock room to render. */}
            <TableHead className="hidden w-[44px] sm:table-cell" />
            <SortableHeader
              column="internal_sku"
              label={t("thSku")}
              className="w-[110px] sm:w-[140px]"
            />
            <SortableHeader column="name_en" label={t("thName")} />
            <SortableHeader
              column="category_name"
              label={t("thCategory")}
              className="hidden md:table-cell"
            />
            <SortableHeader
              column="primary_supplier_name"
              label={t("thSupplier")}
              className="hidden lg:table-cell"
            />
            <TableHead className="hidden xl:table-cell">
              {t("thKits")}
            </TableHead>
            <SortableHeader
              column="stock_on_hand"
              label={t("thStock")}
              align="right"
              className="text-right"
            />
            <SortableHeader
              column="default_retail_price"
              label={t("thRetail")}
              align="right"
              className="hidden text-right md:table-cell"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(
                "hover:bg-muted/50 cursor-pointer",
                attentionBorder(row.stockStatus),
              )}
            >
              <TableCell className="hidden p-0 sm:table-cell">
                <Link
                  href={`/parts/${row.id}`}
                  className="flex items-center justify-center px-2 py-1.5"
                  aria-hidden
                  tabIndex={-1}
                >
                  {row.heroUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- See photo-thumb.tsx
                    <img
                      src={row.heroUrl}
                      alt=""
                      className="size-8 rounded border object-cover"
                    />
                  ) : (
                    <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded border border-dashed">
                      <ImageIcon aria-hidden className="size-3.5" />
                    </span>
                  )}
                </Link>
              </TableCell>
              <TableCell className="p-0">
                <Link
                  href={`/parts/${row.id}`}
                  className="block px-4 py-2.5 text-xs"
                >
                  <SegmentedId value={row.internalSku} />
                </Link>
              </TableCell>
              <TableCell className="min-w-0 p-0 whitespace-normal">
                <Link
                  href={`/parts/${row.id}`}
                  className="block px-4 py-2.5 font-medium break-words"
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell className="hidden p-0 md:table-cell">
                <Link href={`/parts/${row.id}`} className="text-muted-foreground block px-4 py-2.5">
                  {row.categoryName ?? "—"}
                </Link>
              </TableCell>
              <TableCell className="hidden p-0 lg:table-cell">
                <Link href={`/parts/${row.id}`} className="block px-4 py-2.5">
                  {row.supplierName ? (
                    <span>
                      {row.supplierName}
                      {row.supplierCount > 1 ? (
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          +{row.supplierCount - 1}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Link>
              </TableCell>
              <TableCell className="hidden p-0 xl:table-cell">
                <Link
                  href={`/parts/${row.id}`}
                  className="flex flex-wrap items-center gap-1 px-4 py-2.5"
                >
                  {row.kits.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <>
                      {row.kits.slice(0, 2).map((k) => (
                        <span
                          key={`${k.sticker_color}-${k.kit_number}`}
                          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                        >
                          <span
                            aria-hidden
                            className="inline-block size-2 rounded-full border border-black/10"
                            style={{
                              backgroundColor: stickerColor(k.sticker_color).hex,
                            }}
                          />
                          {kitCode(k.sticker_color, k.kit_number)}
                        </span>
                      ))}
                      {row.kits.length > 2 ? (
                        <span className="text-muted-foreground text-[10px]">
                          +{row.kits.length - 2}
                        </span>
                      ) : null}
                    </>
                  )}
                </Link>
              </TableCell>
              <TableCell className="p-0 text-right">
                <Link
                  href={`/parts/${row.id}`}
                  className="flex items-center justify-end gap-1.5 px-2 py-2.5 tabular-nums sm:gap-2 sm:px-4"
                >
                  <span>{formatQuantity(row.stockOnHand)}</span>
                  {/* Only LOW and OUT get a pill. A badge on 100% of rows
                      carries zero information and costs attention — the
                      quantity beside it already says "in stock", and the
                      exceptions are what the eye should catch. "In stock" was
                      also the long label crowding the phone column. */}
                  {row.stockStatus === "ok" ? null : (
                    <Badge variant={STOCK_BADGE_VARIANT[row.stockStatus]}>
                      <span className="sm:hidden">
                        {row.stockStatus === "low"
                          ? tStock("shortLow")
                          : tStock("shortOut")}
                      </span>
                      <span className="hidden sm:inline">
                        {tStock(row.stockStatus)}
                      </span>
                    </Badge>
                  )}
                </Link>
              </TableCell>
              <TableCell className="hidden p-0 text-right md:table-cell">
                <Link
                  href={`/parts/${row.id}`}
                  className="block px-4 py-2.5 tabular-nums"
                >
                  {formatDkk(row.retailDkk)}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
