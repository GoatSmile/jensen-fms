"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/money";
import { formatDkk, formatQuantity } from "@/lib/parts/stock";

import { receivePurchaseOrder } from "../_actions/receive";

export type LineRow = {
  id: string;
  partId: string;
  partSku: string;
  partName: string;
  quantity: number;
  receivedQuantity: number;
  /** Nullable — a line whose price hasn't been entered yet. */
  unitPrice: number | null;
  currency: string;
  /** NULL while the line is unpriced; such lines can't be received yet. */
  landedDkkPerUnit: number | null;
};

export type LocationOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  poId: string;
  poStatus: string;
  lines: LineRow[];
  locations: LocationOption[];
  /** Hide the "Receive into" picker (single-location shops); use the default. */
  hideLocation?: boolean;
  /** Location to receive into while the picker is hidden. */
  primaryLocationId?: string | null;
};

export function ReceiveForm({
  poId,
  poStatus,
  lines,
  locations,
  hideLocation = false,
  primaryLocationId = null,
}: Props) {
  const t = useTranslations("poDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [locationId, setLocationId] = useState(
    primaryLocationId ?? locations[0]?.id ?? "",
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isClosed = poStatus === "received" || poStatus === "cancelled";

  function setDraft(lineId: string, value: string) {
    setDrafts((prev) => ({ ...prev, [lineId]: value }));
    if (error) setError(null);
  }

  function fillRemaining(line: LineRow) {
    const outstanding = line.quantity - line.receivedQuantity;
    if (outstanding <= 0) return;
    setDraft(line.id, String(outstanding));
  }

  function fillAllRemaining() {
    const next: Record<string, string> = {};
    for (const line of lines) {
      const outstanding = line.quantity - line.receivedQuantity;
      if (outstanding > 0) next[line.id] = String(outstanding);
    }
    setDrafts(next);
    if (error) setError(null);
  }

  // Resolve drafts to numeric receipts; bad values are treated as "ignore" so
  // typing "abc" doesn't gate the rest of the form.
  const receipts = useMemo(() => {
    const out: Array<{ lineId: string; additionalQty: number }> = [];
    for (const line of lines) {
      const raw = drafts[line.id]?.trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) continue;
      out.push({ lineId: line.id, additionalQty: n });
    }
    return out;
  }, [drafts, lines]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (receipts.length === 0) {
      setError(t("receiveErrNoQtys"));
      return;
    }

    startTransition(async () => {
      const r = await receivePurchaseOrder(poId, locationId, receipts);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDrafts({});
      setSuccess(t("recorded", { count: receipts.length }));
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <section className="rounded-md border">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">{t("receiveTitle")}</h2>
            <p className="text-muted-foreground text-xs">{t("receiveDesc")}</p>
          </div>
          {isClosed ? null : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={fillAllRemaining}
              disabled={isPending}
            >
              {t("receiveAllRemaining")}
            </Button>
          )}
        </header>

        <div className="flex flex-col gap-4 p-4">
          {hideLocation ? null : (
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="receive-location">{t("receiveInto")}</Label>
                <Select
                  value={locationId}
                  onValueChange={setLocationId}
                  disabled={isClosed || locations.length <= 1}
                >
                  <SelectTrigger id="receive-location">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          ({loc.code})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border md:overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("part")}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    {t("thOrdered")}
                  </TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    {t("thAlreadyReceived")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("thOutstanding")}
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    {t("unitPrice")}
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    {t("landedDkkUnit")}
                  </TableHead>
                  <TableHead className="w-[140px] sm:w-[180px]">
                    {t("thReceiveNow")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const outstanding = line.quantity - line.receivedQuantity;
                  return (
                    <TableRow key={line.id}>
                      <TableCell className="min-w-0 whitespace-normal">
                        <div className="flex flex-col">
                          <Link
                            href={`/parts/${line.partId}`}
                            className="font-medium break-words hover:underline"
                          >
                            {line.partName}
                          </Link>
                          <span className="text-muted-foreground font-mono text-xs break-all">
                            {line.partSku}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {formatQuantity(line.quantity)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {formatQuantity(line.receivedQuantity)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          outstanding === 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : ""
                        }`}
                      >
                        {formatQuantity(outstanding)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        <Money
                          amount={line.unitPrice}
                          currency={line.currency}
                          fractionDigits={4}
                          bold={false}
                        />
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        {line.landedDkkPerUnit == null
                          ? "—"
                          : formatDkk(line.landedDkkPerUnit)}
                      </TableCell>
                      <TableCell>
                        {outstanding === 0 ? (
                          <span className="text-muted-foreground text-xs">
                            {t("fullyReceived")}
                          </span>
                        ) : isClosed ? (
                          <span className="text-muted-foreground text-xs">
                            {t("poClosed")}
                          </span>
                        ) : line.landedDkkPerUnit == null ? (
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                            {t("enterPriceFirst")}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Input
                              inputMode="decimal"
                              value={drafts[line.id] ?? ""}
                              onChange={(e) => setDraft(line.id, e.target.value)}
                              placeholder="0"
                              className="h-8 w-[80px]"
                              aria-label={t("receiveQtyAria", {
                                sku: line.partSku,
                              })}
                            />
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              onClick={() => fillRemaining(line)}
                            >
                              {t("allBtn")}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {success}
        </p>
      ) : null}

      {isClosed ? null : (
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isPending || receipts.length === 0 || !locationId}
          >
            {isPending
              ? tCommon("saving")
              : t("saveNReceipts", { count: receipts.length })}
          </Button>
        </div>
      )}
    </form>
  );
}
