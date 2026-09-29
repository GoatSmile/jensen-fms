"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";

import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
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

import { addBikesToAgreement, endAgreementBike } from "../../_actions/agreement-bikes";

export type LineView = {
  id: string;
  bikeId: string;
  frameNumber: string;
  startDate: string;
  yearlyPrice: number | null;
  currency: string | null;
  hasGps: boolean;
  status: "active" | "ended";
  endReason: string | null;
  endedOn: string | null;
  source: string;
};

export type CandidateBike = {
  id: string;
  frameNumber: string;
  unitName: string | null;
  /** The OTHER agreement this bike is active on, if any. */
  onAgreement: string | null;
};

const END_REASONS = ["stolen", "retired", "cancelled", "moved", "ended"] as const;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function fmtPrice(n: number | null, cur: string | null) {
  if (n == null) return "—";
  return `${n.toLocaleString("da-DK", { maximumFractionDigits: 2 })} ${cur ?? "DKK"}`;
}

/**
 * The bikes this agreement covers — one line each (migration 110). Coverage
 * is exactly this list: a bike on an active line is covered, whoever owns it.
 * *Add bikes* offers the customer's bikes; one already on another agreement
 * says so and moves only when ticked. *End* takes a reason and a date and
 * credits nothing.
 */
export function AgreementBikesPanel({
  agreementId,
  lines,
  candidates,
  defaultStartDate,
  canEdit,
}: {
  agreementId: string;
  lines: LineView[];
  candidates: CandidateBike[];
  defaultStartDate: string;
  canEdit: boolean;
}) {
  const t = useTranslations("agreementBikes");
  const tReason = useTranslations("agreementEndReason");
  const today = new Date().toISOString().slice(0, 10);
  const active = lines.filter((l) => l.status === "active");
  const ended = lines.filter((l) => l.status === "ended");

  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [price, setPrice] = useState("1704");
  const [gps, setGps] = useState(false);
  const [endLine, setEndLine] = useState<LineView | null>(null);
  const [reason, setReason] = useState<string>("cancelled");
  const [endedOn, setEndedOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => {
    const q = filter.trim().toUpperCase().replace(/[\s.-]/g, "");
    return q
      ? candidates.filter((c) => c.frameNumber.toUpperCase().replace(/[\s.-]/g, "").includes(q))
      : candidates;
  }, [candidates, filter]);

  function toggle(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitAdd() {
    setError(null);
    const priceNum = price.trim() === "" ? null : Number(price.replace(",", "."));
    if (priceNum != null && !Number.isFinite(priceNum)) {
      setError(t("priceInvalid"));
      return;
    }
    const ids = [...picked];
    startTransition(async () => {
      const r = await addBikesToAgreement(agreementId, {
        bikeIds: ids,
        startDate,
        yearlyPrice: priceNum,
        hasGps: gps,
        moveBikeIds: ids.filter((id) => candidates.find((c) => c.id === id)?.onAgreement),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPicked(new Set());
      setAddOpen(false);
    });
  }

  function submitEnd() {
    if (!endLine) return;
    setError(null);
    startTransition(async () => {
      const r = await endAgreementBike(endLine.id, { reason, endedOn });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEndLine(null);
    });
  }

  return (
    <Panel
      title={t("title", { count: active.length })}
      description={t("desc")}
      action={
        canEdit ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden /> {t("add")}
          </Button>
        ) : null
      }
      contentClassName="flex flex-col gap-4"
    >
      {active.length === 0 ? (
        <p className="bg-ground text-muted-foreground rounded-lg p-4 text-sm">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colFrame")}</TableHead>
              <TableHead>{t("colStart")}</TableHead>
              <TableHead className="text-right">{t("colPrice")}</TableHead>
              <TableHead>{t("colGps")}</TableHead>
              <TableHead>{t("colSource")}</TableHead>
              {canEdit ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <Link href={`/bikes/${l.bikeId}`} className="font-mono hover:underline">
                    {l.frameNumber}
                  </Link>
                </TableCell>
                <TableCell>{fmtDate(l.startDate)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPrice(l.yearlyPrice, l.currency)}</TableCell>
                <TableCell>{l.hasGps ? t("yes") : "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{t(`source.${l.source}`)}</TableCell>
                {canEdit ? (
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setError(null);
                        setReason("cancelled");
                        setEndedOn(today);
                        setEndLine(l);
                      }}
                    >
                      {t("end")}
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {ended.length > 0 ? (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">{t("endedTitle", { count: ended.length })}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {ended.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/bikes/${l.bikeId}`} className="font-mono hover:underline">
                  {l.frameNumber}
                </Link>
                <Badge variant="outline">{l.endReason && tReason.has(l.endReason) ? tReason(l.endReason) : l.endReason}</Badge>
                <span className="text-muted-foreground text-xs">
                  {l.endedOn ? t("endedOn", { date: fmtDate(l.endedOn) }) : t("endedUnknown")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Dialog open={addOpen} onOpenChange={(o) => !pending && setAddOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("addTitle")}</DialogTitle>
            <DialogDescription>{t("addDesc")}</DialogDescription>
          </DialogHeader>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("filterPlaceholder")} />
          {candidates.length === 0 ? (
            <p className="bg-ground text-muted-foreground rounded-lg p-4 text-sm">{t("noCandidates")}</p>
          ) : (
            <ul className="bg-ground flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-lg p-2">
              {shown.map((c) => (
                <li key={c.id}>
                  <label className="hover:bg-surface flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                    <input type="checkbox" className="size-4" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="font-mono">{c.frameNumber}</span>
                    {c.unitName ? <span className="text-muted-foreground text-xs">{c.unitName}</span> : null}
                    {c.onAgreement ? (
                      <Badge variant="warning" className="ml-auto">
                        {picked.has(c.id)
                          ? t("willMove", { agreement: c.onAgreement })
                          : t("onOther", { agreement: c.onAgreement })}
                      </Badge>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("fldStart")} htmlFor="add-start">
              <Input id="add-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label={t("fldPrice")} htmlFor="add-price">
              <Input id="add-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" className="size-4" checked={gps} onChange={(e) => setGps(e.target.checked)} />
              {t("fldGps")}
            </label>
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={submitAdd} disabled={pending || picked.size === 0}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("addN", { count: picked.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={endLine != null} onOpenChange={(o) => !pending && !o && setEndLine(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("endTitle", { frame: endLine?.frameNumber ?? "" })}</DialogTitle>
            <DialogDescription>{t("endDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("fldReason")} htmlFor="end-reason">
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="end-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {END_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tReason(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("fldEndedOn")} htmlFor="end-date">
              <Input id="end-date" type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} />
            </Field>
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="destructive" onClick={submitEnd} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("endConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
