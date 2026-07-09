"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  Minus,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/money";
import { appendField } from "@/lib/forms";
import { kitCode, stickerColor } from "@/lib/kits/colors";
import {
  addKitPartsToWO,
  addPartToWO,
  removePartFromWO,
  updateWOPartQty,
} from "@/app/maintenance/work-orders/[id]/_actions/manage-wo-parts";

export type TrayRow = {
  id: string;
  partId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
};

export type CatalogPart = {
  id: string;
  sku: string;
  name: string;
  categoryName: string | null;
  retailDkk: number | null;
};

export type KitCard = {
  kitId: string;
  stickerColor: string;
  kitNumber: number | null;
  /** Bike parts carrying this label. */
  totalParts: number;
  /** Of those, already on the work order. */
  alreadyAdded: number;
};

type Props = {
  woId: string;
  woNumber: string;
  frameNumber: string | null;
  initialTray: TrayRow[];
  catalog: CatalogPart[];
  kits: KitCard[];
};

/**
 * Full-screen add-parts flow for the technician. Everything adds in place —
 * no dialog, nothing closes between adds — and the tech returns to the work
 * order with one big Done button when the bench is restocked. Prices shown
 * are retail (what the customer pays); cost never appears here.
 */
export function AddPartsWorkspace({
  woId,
  woNumber,
  frameNumber,
  initialTray,
  catalog,
  kits,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const tray = initialTray;
  const trayByPartId = useMemo(
    () => new Map(tray.map((r) => [r.partId, r])),
    [tray],
  );

  const retailTotal = useMemo(
    () =>
      tray.reduce(
        (s, r) => s + (r.unitPrice != null ? r.unitPrice * r.quantity : 0),
        0,
      ),
    [tray],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((p) =>
      [p.sku, p.name, p.categoryName ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [catalog, query]);

  /** Run a server action with shared busy/error/notice plumbing. */
  function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successNotice?: (r: { ok: true } & Record<string, unknown>) => string | null,
  ) {
    setError(null);
    setNotice(null);
    setBusyKey(key);
    start(async () => {
      const r = await fn();
      setBusyKey(null);
      if (!r.ok) {
        setError(r.error ?? "Something went wrong.");
        return;
      }
      if (successNotice) {
        const msg = successNotice(r as { ok: true } & Record<string, unknown>);
        if (msg) setNotice(msg);
      }
      router.refresh();
    });
  }

  function onGrabKit(kit: KitCard) {
    const code = kitCode(kit.stickerColor, kit.kitNumber);
    run(
      `kit:${kit.kitId}`,
      () => addKitPartsToWO(woId, kit.kitId),
      (r) => {
        const added = Number(r.added ?? 0);
        const skipped = Number(r.skipped ?? 0);
        return skipped > 0
          ? `${code}: added ${added} part${added === 1 ? "" : "s"}, ${skipped} already on the work order.`
          : `${code}: added ${added} part${added === 1 ? "" : "s"}.`;
      },
    );
  }

  function onAddPart(part: CatalogPart) {
    run(`add:${part.id}`, () => {
      const fd = new FormData();
      appendField(fd, "part_id", part.id);
      appendField(fd, "quantity", "1");
      return addPartToWO(woId, fd);
    });
  }

  function onChangeQty(row: TrayRow, nextQty: number) {
    run(`qty:${row.id}`, () => updateWOPartQty(woId, row.id, nextQty));
  }

  function onRemove(row: TrayRow) {
    run(`remove:${row.id}`, () => removePartFromWO(woId, row.id));
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 sm:p-6">
      {/* Sticky header: where am I + the one exit. */}
      <header className="bg-background sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex min-w-0 flex-col">
          <span className="text-muted-foreground font-mono text-[10px] font-medium uppercase tracking-wider">
            {woNumber} · add parts
          </span>
          <span className="truncate font-mono text-lg font-bold tracking-tight">
            {frameNumber ?? "—"}
          </span>
        </div>
        <Button asChild size="lg" className="h-11">
          <Link href={`/work/${woId}`}>
            <ChevronLeft className="size-4" aria-hidden /> Done — back to work
            order
          </Link>
        </Button>
      </header>

      <div className="flex flex-col gap-5 pt-4">
        {error ? (
          <p
            className="bg-destructive/10 text-destructive border-destructive/30 rounded-md border p-3 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
            role="status"
          >
            {notice}
          </p>
        ) : null}

        {/* Kit shortcut — one tap restocks the whole sticker code. */}
        {kits.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              This bike&rsquo;s kits
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {kits.map((kit) => {
                const colour = stickerColor(kit.stickerColor);
                const code = kitCode(kit.stickerColor, kit.kitNumber);
                const allAdded = kit.alreadyAdded >= kit.totalParts;
                const busy = busyKey === `kit:${kit.kitId}`;
                return (
                  <div
                    key={kit.kitId}
                    className="overflow-hidden rounded-md border"
                  >
                    <div
                      className="flex items-center justify-between gap-2 px-3 py-2"
                      style={{ backgroundColor: colour.hex, color: colour.fg }}
                    >
                      <span className="text-sm font-bold tracking-wide">
                        {code}
                      </span>
                      <span className="text-xs font-medium opacity-90">
                        {kit.totalParts} part{kit.totalParts === 1 ? "" : "s"}
                        {kit.alreadyAdded > 0
                          ? ` · ${kit.alreadyAdded} added`
                          : ""}
                      </span>
                    </div>
                    <div className="p-2">
                      <Button
                        type="button"
                        variant={allAdded ? "outline" : "default"}
                        className="h-11 w-full"
                        onClick={() => onGrabKit(kit)}
                        disabled={pending || allAdded}
                      >
                        {allAdded ? (
                          <>
                            <Check className="size-4" aria-hidden /> All on the
                            work order
                          </>
                        ) : (
                          <>
                            <Package className="size-4" aria-hidden />
                            {busy ? "Adding…" : "I grabbed this kit"}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* What's on the WO right now — steppers adjust, trash removes. */}
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              On this work order ({tray.length})
            </h2>
            {tray.length > 0 ? (
              <span className="text-xs tabular-nums">
                Total (excl. VAT):{" "}
                <span className="font-semibold">
                  <Money amount={retailTotal} currency="DKK" bold={false} />
                </span>
              </span>
            ) : null}
          </div>
          {tray.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm italic">
              Nothing yet — grab a kit above or add parts below.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {tray.map((row) => {
                const rowBusy =
                  busyKey === `qty:${row.id}` || busyKey === `remove:${row.id}`;
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 p-2.5"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {row.name}
                      </span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {row.sku}
                        {row.unitPrice != null ? (
                          <span className="ml-2 font-sans">
                            <Money
                              amount={row.unitPrice}
                              currency="DKK"
                              bold={false}
                            />
                            {" / pc"}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`One less ${row.name}`}
                        onClick={() => onChangeQty(row, row.quantity - 1)}
                        disabled={pending || row.quantity <= 1}
                      >
                        <Minus className="size-4" aria-hidden />
                      </Button>
                      <span className="w-9 text-center text-sm font-semibold tabular-nums">
                        {row.quantity}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`One more ${row.name}`}
                        onClick={() => onChangeQty(row, row.quantity + 1)}
                        disabled={pending}
                      >
                        <Plus className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${row.name}`}
                        onClick={() => onRemove(row)}
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                    {rowBusy ? <span className="sr-only">Working…</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Catalog — add stays on the page; repeat taps become +1. */}
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Add more parts
          </h2>
          <div className="relative">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by SKU, name, category…"
              className="h-11 pl-9"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm italic">
              No parts match.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {filtered.map((part) => {
                const onWO = trayByPartId.get(part.id);
                const busy = busyKey === `add:${part.id}` ||
                  (onWO != null && busyKey === `qty:${onWO.id}`);
                return (
                  <li
                    key={part.id}
                    className="flex items-center justify-between gap-3 p-2.5"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {part.name}
                      </span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {part.sku}
                        {part.categoryName ? (
                          <span className="ml-1.5 font-sans">
                            · {part.categoryName}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      {part.retailDkk != null ? (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          <Money
                            amount={part.retailDkk}
                            currency="DKK"
                            bold={false}
                          />
                        </span>
                      ) : null}
                      {onWO ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 min-w-[72px]"
                          onClick={() => onChangeQty(onWO, onWO.quantity + 1)}
                          disabled={pending}
                        >
                          {busy ? (
                            "…"
                          ) : (
                            <>
                              <Plus className="size-4" aria-hidden /> 1
                              <Badge
                                variant="secondary"
                                className="ml-1 tabular-nums"
                              >
                                {onWO.quantity}
                              </Badge>
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="h-11 min-w-[72px]"
                          onClick={() => onAddPart(part)}
                          disabled={pending}
                        >
                          {busy ? (
                            "Adding…"
                          ) : (
                            <>
                              <Plus className="size-4" aria-hidden /> Add
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
