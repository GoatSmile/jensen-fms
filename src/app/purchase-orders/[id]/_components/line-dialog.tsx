"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appendField } from "@/lib/forms";
import { formatPrice } from "@/lib/format";
import { formatPct } from "@/lib/parts/format";
import {
  defaultApplyImportTax,
  type ImportTaxBasis,
  type PartOrigin,
} from "@/lib/purchasing/import-tax";

import { lookupFxRate } from "../_actions/lookup-fx";
import { addLine, updateLine } from "../_actions/manage-lines";

export type PartChoice = {
  id: string;
  internal_sku: string;
  name_en: string;
  /** Snapshotted onto the PO line at insert; preview here for transparency. */
  hsCode: string | null;
  tariffPct: number;
  /** Anti-dumping rate (0 = none) — same snapshot rule as tariffPct. */
  antiDumpingPct: number;
  /** Customs origin (null = unclassified) — drives the import-tax default. */
  origin: PartOrigin | null;
};

export type CurrencyChoice = {
  code: string;
  name_en: string;
};

export type LineDialogInitial = {
  lineId: string;
  partId: string;
  partLabel: string;
  quantity: number;
  /** Nullable — a PO request can carry a line whose price isn't known yet. */
  unitPrice: number | null;
  currency: string;
  fxRateToDkk: number;
  /** Decimal 0.10 = 10 %. */
  transportPct: number;
  /** Decimal — snapshotted from the part's HS code at the time the line was added. */
  tariffPct: number;
  /** Decimal — anti-dumping rate snapshotted alongside tariffPct (0 = none). */
  antiDumpingPct: number;
  /** Frozen reason behind the snapshot; null on lines predating migration 54. */
  importTaxBasis: ImportTaxBasis | null;
  notes: string | null;
};

type Mode =
  | { kind: "add"; poId: string }
  | { kind: "edit"; initial: LineDialogInitial };

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
  parts: PartChoice[];
  currencies: CurrencyChoice[];
  /** Latest from_currency → DKK rate, used to pre-fill fx_rate_to_dkk. */
  fxRatesByCurrency: Record<string, number>;
  /** Part ids already on the PO (other rows), disabled in the picker. */
  excludePartIds: Set<string>;
  /** Default transport % for new lines, sourced from app_settings (0.10 = 10 %). */
  defaultTransportPct: number;
  /** PO's order_date — used for historical FX lookup against fx_rates / Frankfurter. */
  orderDate: string;
  /** The PO supplier's import_duty_prepaid_default — feeds the import-tax default. */
  supplierDutyPrepaid: boolean;
};

/**
 * Add / edit a PO line. The DB owns `landed_cost_dkk_per_unit` (it's a
 * GENERATED column) so we never write it — we only preview the same
 * arithmetic in the footer so the user sees the landed cost as they type.
 *
 * FX rate behaviour:
 *   - DKK → forced to 1.0, input disabled.
 *   - Anything else → auto-filled from the latest fx_rates row when known,
 *     otherwise we show a hint and leave the input editable.
 */
export function LineDialog({
  open,
  onOpenChange,
  mode,
  parts,
  currencies,
  fxRatesByCurrency,
  excludePartIds,
  defaultTransportPct,
  orderDate,
  supplierDutyPrepaid,
}: Props) {
  const t = useTranslations("poDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const initialPartId = mode.kind === "edit" ? mode.initial.partId : "";
  const initialQty =
    mode.kind === "edit" ? String(mode.initial.quantity) : "1";
  const initialPrice =
    mode.kind === "edit" && mode.initial.unitPrice != null
      ? String(mode.initial.unitPrice)
      : "";
  const initialCurrency =
    mode.kind === "edit" ? mode.initial.currency : "DKK";
  const initialFx =
    mode.kind === "edit"
      ? String(mode.initial.fxRateToDkk)
      : initialCurrency === "DKK"
        ? "1"
        : String(fxRatesByCurrency[initialCurrency] ?? "");
  // Form holds the percent (e.g. "10.2") but the action expects the DB-side
  // decimal (0.102). Conversion happens in buildFormData() below.
  const initialTransport =
    mode.kind === "edit"
      ? String(Math.round(mode.initial.transportPct * 10000) / 100)
      : String(Math.round(defaultTransportPct * 10000) / 100);
  const initialNotes =
    mode.kind === "edit" ? mode.initial.notes ?? "" : "";
  // Edit mode reconstructs the toggle from the frozen basis: "applied" was
  // on; any recorded zero-reason was off. Pre-tracking lines (null basis)
  // fall back to "did the snapshot carry a rate" — old lines always applied.
  // Add mode starts off; picking a part sets the derived default.
  const initialApplyImportTax =
    mode.kind === "edit"
      ? mode.initial.importTaxBasis === "applied" ||
        (mode.initial.importTaxBasis == null &&
          (mode.initial.tariffPct > 0 || mode.initial.antiDumpingPct > 0))
      : false;

  const [partId, setPartId] = useState(initialPartId);
  const [applyImportTax, setApplyImportTax] = useState(initialApplyImportTax);
  const [filter, setFilter] = useState("");
  const [quantity, setQuantity] = useState(initialQty);
  const [unitPrice, setUnitPrice] = useState(initialPrice);
  const [currency, setCurrency] = useState(initialCurrency);
  const [fxRate, setFxRate] = useState(initialFx);
  const [transport, setTransport] = useState(initialTransport);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  // FX lookup state — when the user picks a foreign currency we hit
  // /admin/fx-rates' cache (then Frankfurter) for the rate that was
  // effective on the PO's order_date. Stays out of the way for DKK.
  const [fxLookup, setFxLookup] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; actualDate: string; source: "cache" | "frankfurter" }
    | { kind: "missing"; message: string }
  >({ kind: "idle" });

  // Preview mirrors what a save will write: saving (add OR update) resolves
  // the part's live rates and zeroes them when "Apply import tax" is off.
  // Edit mode falls back to the line's frozen snapshot only if the part has
  // vanished from the catalog (soft-deleted since the line was added).
  const selectedPart = useMemo(
    () => parts.find((p) => p.id === partId) ?? null,
    [parts, partId],
  );
  const resolvedTariffPct =
    selectedPart?.tariffPct ??
    (mode.kind === "edit" ? mode.initial.tariffPct : 0);
  const resolvedAntiDumpingPct =
    selectedPart?.antiDumpingPct ??
    (mode.kind === "edit" ? mode.initial.antiDumpingPct : 0);
  const previewTariffPct = applyImportTax ? resolvedTariffPct : 0;
  const previewAntiDumpingPct = applyImportTax ? resolvedAntiDumpingPct : 0;
  const previewHsCode = selectedPart?.hsCode ?? null;

  // Edit mode locks the part to keep the row identity stable in the UI.
  const partLocked = mode.kind === "edit";

  function onPickPart(part: PartChoice) {
    setPartId(part.id);
    // Re-derive the import-tax default for the newly picked part — the
    // toggle is a per-part decision, so a manual tweak for part A shouldn't
    // stick to part B.
    setApplyImportTax(defaultApplyImportTax(part.origin, supplierDutyPrepaid));
  }

  // Keep FX rate in lock-step with the currency choice. For DKK we hard-code
  // 1. For foreign currencies we kick off a historical lookup against the
  // PO's order_date (cache-first via /admin/fx-rates, falls through to
  // Frankfurter). The user can still override the number after.
  function onCurrencyChange(next: string) {
    setCurrency(next);
    if (next === "DKK") {
      setFxRate("1");
      setFxLookup({ kind: "idle" });
      return;
    }
    // Optimistic pre-fill from whatever's already cached so the input
    // doesn't go blank while the lookup runs.
    const known = fxRatesByCurrency[next];
    if (known != null) setFxRate(String(known));
    void runFxLookup(next);
  }

  function runFxLookup(forCurrency: string) {
    return (async () => {
      setFxLookup({ kind: "loading" });
      const r = await lookupFxRate(forCurrency, "DKK", orderDate);
      if (!r.ok) {
        setFxLookup({ kind: "missing", message: r.error });
        return;
      }
      setFxRate(String(r.rate));
      setFxLookup({
        kind: "ok",
        actualDate: r.actualDate,
        source: r.source,
      });
    })();
  }

  // On mount: if we're adding a new foreign-currency line, fetch the
  // historical rate. Edit mode keeps the snapshotted value untouched.
  useEffect(() => {
    if (mode.kind !== "add") return;
    if (initialCurrency === "DKK") return;
    void runFxLookup(initialCurrency);
    // Intentionally fire once on mount; runFxLookup's dependencies (orderDate,
    // currencies list) are stable per dialog instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredParts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) =>
      `${p.internal_sku} ${p.name_en}`.toLowerCase().includes(q),
    );
  }, [parts, filter]);

  // Live preview of the additive landed-cost breakdown. Keeping each piece
  // separate so the dialog can show the user "base + transport + import tax".
  // The transport input holds the percent (e.g. "10.2"); divide by 100 for
  // arithmetic. The tariff snapshot is already a decimal.
  const breakdown = useMemo(() => {
    const u = Number(String(unitPrice).replace(",", "."));
    const fx = Number(String(fxRate).replace(",", "."));
    const tpPercent = Number(String(transport).replace(",", "."));
    const tt = previewTariffPct;
    const ad = previewAntiDumpingPct;
    if (
      !Number.isFinite(u) ||
      !Number.isFinite(fx) ||
      !Number.isFinite(tpPercent) ||
      !Number.isFinite(tt) ||
      !Number.isFinite(ad)
    ) {
      return null;
    }
    if (u < 0 || fx <= 0 || tpPercent < 0 || tt < 0 || ad < 0) return null;
    const tp = tpPercent / 100;
    const base = u * fx;
    const transportDkk = base * tp;
    const importTaxDkk = base * tt;
    const antiDumpingDkk = base * ad;
    const landed = base + transportDkk + importTaxDkk + antiDumpingDkk;
    return {
      base: Math.round(base * 10000) / 10000,
      transportDkk: Math.round(transportDkk * 10000) / 10000,
      importTaxDkk: Math.round(importTaxDkk * 10000) / 10000,
      antiDumpingDkk: Math.round(antiDumpingDkk * 10000) / 10000,
      landed: Math.round(landed * 10000) / 10000,
    };
  }, [unitPrice, fxRate, transport, previewTariffPct, previewAntiDumpingPct]);

  const lineTotalNative = useMemo(() => {
    const u = Number(String(unitPrice).replace(",", "."));
    const q = Number(String(quantity).replace(",", "."));
    if (!Number.isFinite(u) || !Number.isFinite(q)) return null;
    if (u < 0 || q <= 0) return null;
    return u * q;
  }, [unitPrice, quantity]);

  const fxKnown =
    currency === "DKK" || fxRatesByCurrency[currency] != null;

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "part_id", partId);
    appendField(fd, "quantity", quantity.trim().replace(",", "."));
    appendField(fd, "unit_price", unitPrice.trim().replace(",", "."));
    appendField(fd, "currency", currency);
    appendField(fd, "fx_rate_to_dkk", fxRate.trim().replace(",", "."));
    // UI holds a percent ("10.2"); action expects the DB-side decimal.
    const transportPercent =
      transport.trim() === ""
        ? defaultTransportPct * 100
        : Number(transport.trim().replace(",", "."));
    const transportDecimal = Number.isFinite(transportPercent)
      ? transportPercent / 100
      : defaultTransportPct;
    appendField(fd, "transport_pct", String(transportDecimal));
    if (applyImportTax) fd.set("apply_import_tax", "on");
    appendField(fd, "notes", notes);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!partId) {
      setError(t("errPickPart"));
      return;
    }

    const fd = buildFormData();
    start(async () => {
      const r =
        mode.kind === "add"
          ? await addLine(mode.poId, fd)
          : await updateLine(mode.initial.lineId, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const title = mode.kind === "add" ? t("addLine") : t("editLineTitle");
  const submitLabel = mode.kind === "add" ? t("addLine") : t("saveChanges");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t("dialogDesc")}</DialogDescription>
          </DialogHeader>

          {/* Part picker */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="line-part-filter">{t("part")}</Label>
            {partLocked ? (
              <div className="bg-muted/40 rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">
                  {mode.kind === "edit" ? mode.initial.partLabel : ""}
                </span>
              </div>
            ) : (
              <>
                <Input
                  id="line-part-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t("filterPartsPlaceholder")}
                />
                <div className="max-h-56 overflow-y-auto rounded-md border">
                  {filteredParts.length === 0 ? (
                    <p className="text-muted-foreground p-3 text-center text-sm">
                      {t("noPartsMatch")}
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {filteredParts.map((p) => {
                        const disabled = excludePartIds.has(p.id);
                        const isPicked = partId === p.id;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => onPickPart(p)}
                              disabled={disabled}
                              className={`hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                                isPicked ? "bg-muted" : ""
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{p.name_en}</span>
                                <span className="text-muted-foreground font-mono text-xs">
                                  {p.internal_sku}
                                </span>
                              </div>
                              {disabled ? (
                                <span className="text-muted-foreground text-xs">
                                  {t("alreadyOnPo")}
                                </span>
                              ) : isPicked ? (
                                <span className="text-xs text-emerald-700 dark:text-emerald-400">
                                  {t("selected")}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-qty">{t("quantity")}</Label>
              <Input
                id="line-qty"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-price">{t("unitPrice")}</Label>
              <Input
                id="line-price"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder={t("unitPriceOptional")}
              />
              <p className="text-muted-foreground text-[11px] leading-tight">
                {t("unitPriceHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-currency">{t("currency")}</Label>
              <Select value={currency} onValueChange={onCurrencyChange}>
                <SelectTrigger id="line-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-fx">{t("fxRateLabel")}</Label>
              <Input
                id="line-fx"
                inputMode="decimal"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                disabled={currency === "DKK"}
                required
              />
              {currency !== "DKK" ? (
                <p className="text-muted-foreground text-xs">
                  {fxLookup.kind === "loading"
                    ? t("fxLookingUp", { currency, date: orderDate })
                    : fxLookup.kind === "ok"
                      ? t("fxEcbRateFor", { date: fxLookup.actualDate }) +
                        (fxLookup.actualDate !== orderDate
                          ? t("fxClosestBusinessDay", { date: orderDate })
                          : "") +
                        (fxLookup.source === "frankfurter"
                          ? t("fxJustFetched")
                          : "") +
                        t("fxOverrideHint")
                      : fxLookup.kind === "missing"
                        ? t("fxMissing", { message: fxLookup.message })
                        : fxKnown
                          ? t("fxPrefilled")
                          : t("fxNoRate", { currency })}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-transport">{t("transportPct")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="line-transport"
                  inputMode="decimal"
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  placeholder={String(
                    Math.round(defaultTransportPct * 10000) / 100,
                  )}
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
              <p className="text-muted-foreground text-xs">
                {t.rich("transportHint", {
                  mono: (chunks) => (
                    <span className="font-mono">{chunks}</span>
                  ),
                  code: (chunks) => <code>{chunks}</code>,
                })}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={applyImportTax}
                onChange={(e) => setApplyImportTax(e.target.checked)}
                disabled={!partId}
                className="size-4"
              />
              {t("applyImportTax")}
            </label>
            {partId ? (
              <p className="text-muted-foreground pl-6 text-xs">
                {t(
                  (selectedPart?.origin ?? null) === "eu"
                    ? "importHintEu"
                    : supplierDutyPrepaid
                      ? "importHintPrepaid"
                      : (selectedPart?.origin ?? null) == null
                        ? "importHintUnclassified"
                        : "importHintNonEu",
                )}
                {t("importHintSuffix")}
              </p>
            ) : (
              <p className="text-muted-foreground pl-6 text-xs">
                {t("importHintNoPart")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="line-notes">{t("notes")}</Label>
            <Textarea
              id="line-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("lineNotesPlaceholder")}
            />
          </div>

          {/* Live preview of the additive landed-cost breakdown. */}
          <div className="bg-muted/30 flex flex-col gap-1.5 rounded-md border px-3 py-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("lineTotalNative", { currency })}
              </span>
              <span className="font-medium tabular-nums">
                {formatPrice(lineTotalNative, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("baseDkkUnit")}</span>
              <span className="tabular-nums">
                {formatPrice(breakdown?.base ?? null, "DKK")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("plusTransport")}</span>
              <span className="tabular-nums">
                {formatPrice(breakdown?.transportDkk ?? null, "DKK")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("plusImportTax")}{" "}
                {!applyImportTax ? (
                  <span className="italic">{t("importNotApplied")}</span>
                ) : previewHsCode ? (
                  <span className="font-mono">({previewHsCode}, {formatPct(previewTariffPct)})</span>
                ) : previewTariffPct > 0 ? (
                  <span>({formatPct(previewTariffPct)})</span>
                ) : (
                  <span className="italic">{t("noHsCode")}</span>
                )}
              </span>
              <span className="tabular-nums">
                {formatPrice(breakdown?.importTaxDkk ?? null, "DKK")}
              </span>
            </div>
            {previewAntiDumpingPct > 0 ? (
              <div className="flex justify-between">
                <span className="text-destructive">
                  {t("plusAntiDumpingLabel", {
                    pct: formatPct(previewAntiDumpingPct),
                  })}
                </span>
                <span className="tabular-nums">
                  {formatPrice(breakdown?.antiDumpingDkk ?? null, "DKK")}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1.5">
              <span className="text-muted-foreground">{t("landedDkkUnit")}</span>
              <span className="font-semibold tabular-nums">
                {formatPrice(breakdown?.landed ?? null, "DKK")}
              </span>
            </div>
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending || !partId}>
              {isPending ? tCommon("saving") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
