"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDkk, formatQuantity } from "@/lib/parts/stock";

// Cross-route import is deliberate: one FX-lookup path (cache-first, then
// Frankfurter, upsert into fx_rates) shared with the PO line dialog.
import { lookupFxRate } from "@/app/purchase-orders/[id]/_actions/lookup-fx";
import { adjustStock } from "../_actions/adjust-stock";

export type LocationOption = {
  id: string;
  code: string;
  name: string;
  /** Current on-hand from v_current_stock. Missing locations default to 0. */
  currentOnHand: number;
};

export type CurrencyOption = { code: string };

type Props = {
  partId: string;
  partName: string;
  locations: LocationOption[];
  /** Pre-selected location, e.g. when triggered from a stock-row "Adjust" button. */
  defaultLocationId?: string;
  /** Render in compact (per-row "Adjust") or default (header) trigger style. */
  triggerVariant?: "default" | "row";
  /** Hide the location picker (single-location shops) and target the default. */
  hideLocation?: boolean;
  /**
   * Currencies for the unit-cost picker. Historical buys in USD/JPY enter
   * the original amount; the rate for the purchase date is auto-looked-up.
   * Omit (or pass []) to keep the cost input DKK-only.
   */
  currencies?: CurrencyOption[];
  /**
   * What a unit currently costs us (DKK), from `v_part_last_cost`. Pre-fills
   * the cost box so a plain recount is one click rather than a research task:
   * a count correction is not a revaluation. Null when nothing knows yet —
   * that is the found-in-storage case, and then a figure must be typed.
   */
  prevailingCostDkk?: number | null;
};

type Mode = "delta" | "set";

export function AdjustStockDialog({
  partId,
  partName,
  locations,
  defaultLocationId,
  triggerVariant = "default",
  hideLocation = false,
  currencies = [],
  prevailingCostDkk = null,
}: Props) {
  const t = useTranslations("partDetail");
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (locations.length === 0) {
    // No active locations on file — render a disabled trigger so the affordance
    // still exists but the user gets a hint rather than a broken dialog.
    return (
      <Button
        variant={triggerVariant === "row" ? "ghost" : "default"}
        size={triggerVariant === "row" ? "xs" : "default"}
        disabled
        title={t("noActiveLocations")}
      >
        {triggerVariant === "row" ? null : <PackagePlus aria-hidden />}
        {t("adjustStock")}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerVariant === "row" ? (
          <Button size="xs" variant="ghost">
            {t("adjust")}
          </Button>
        ) : (
          <Button>
            <PackagePlus aria-hidden /> {t("adjustStock")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <AdjustStockForm
          partId={partId}
          partName={partName}
          locations={locations}
          defaultLocationId={defaultLocationId}
          hideLocation={hideLocation}
          currencies={currencies}
          prevailingCostDkk={prevailingCostDkk}
          onCancel={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
            // The server action calls revalidatePath, which invalidates the
            // RSC cache but doesn't push the new payload to this already-
            // mounted client tree. router.refresh() pulls the fresh render so
            // stat strip + movements list update without a hard reload.
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AdjustStockForm({
  partId,
  partName,
  locations,
  defaultLocationId,
  hideLocation,
  currencies,
  prevailingCostDkk,
  onSuccess,
  onCancel,
}: {
  partId: string;
  partName: string;
  locations: LocationOption[];
  defaultLocationId?: string;
  hideLocation: boolean;
  currencies: CurrencyOption[];
  prevailingCostDkk: number | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("partDetail");
  const tCommon = useTranslations("common");
  const [locationId, setLocationId] = useState(
    defaultLocationId ?? locations[0]!.id,
  );
  const [mode, setMode] = useState<Mode>("delta");
  const [valueText, setValueText] = useState("");
  const [reason, setReason] = useState("");
  const [unitCostText, setUnitCostText] = useState(
    prevailingCostDkk != null ? String(prevailingCostDkk) : "",
  );
  const [costCurrency, setCostCurrency] = useState("DKK");
  const [fxRateText, setFxRateText] = useState("");
  const [fxLookup, setFxLookup] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; actualDate: string; source: "cache" | "frankfurter" }
    | { kind: "missing"; message: string }
  >({ kind: "idle" });
  const [dateText, setDateText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Clamp the back-date picker to today — no future ledger entries.
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Historical FX for a foreign-currency cost: the rate effective on the
  // PURCHASE date (the back-date, else today) — "the correct dollar" for a
  // 2021 buy, not today's. Refires when currency or date changes; a manual
  // rate override in between survives until one of those changes again.
  const fxDate = dateText.trim() || todayIso;
  useEffect(() => {
    if (costCurrency === "DKK") {
      setFxLookup({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setFxLookup({ kind: "loading" });
    void lookupFxRate(costCurrency, "DKK", fxDate).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setFxLookup({ kind: "missing", message: r.error });
        return;
      }
      setFxRateText(String(r.rate));
      setFxLookup({
        kind: "ok",
        actualDate: r.actualDate,
        source: r.source,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [costCurrency, fxDate]);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === locationId) ?? locations[0]!,
    [locationId, locations],
  );

  // Live preview of the resulting on-hand. We tolerate partial input ("-",
  // empty, "abc") and just show "—" — only reject on submit.
  const preview = useMemo(() => {
    const v = Number(valueText);
    if (!Number.isFinite(v) || valueText.trim() === "") return null;
    if (mode === "delta") {
      return {
        delta: v,
        resulting: selectedLocation.currentOnHand + v,
      };
    }
    return {
      delta: v - selectedLocation.currentOnHand,
      resulting: v,
    };
  }, [valueText, mode, selectedLocation]);

  const previewIsNegative = preview != null && preview.resulting < 0;

  // Cost is a question only for stock coming IN. Stock going out inherits the
  // prevailing cost server-side (migration 88), so the box is hidden rather
  // than ignored — an input nobody should fill is worse than no input.
  const isDecrease = preview != null && preview.delta < 0;

  // Live DKK/unit for a foreign cost — same arithmetic the action persists.
  const foreignCostDkk = useMemo(() => {
    if (costCurrency === "DKK") return null;
    const amount = Number(unitCostText.trim().replace(",", "."));
    const rate = Number(fxRateText.trim().replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) return null;
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return Math.round(amount * rate * 10000) / 10000;
  }, [costCurrency, unitCostText, fxRateText]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const value = Number(valueText);
    if (!Number.isFinite(value)) {
      setError(t("qtyNumberError"));
      return;
    }

    // Removing stock never carries a cost — the server derives it.
    const trimmedCost = isDecrease ? "" : unitCostText.trim();
    if (!isDecrease && trimmedCost === "") {
      setError(t("costRequiredOnIncrease"));
      return;
    }
    let unitCostDkk: number | null = null;
    let unitCostForeign: {
      amount: number;
      currency: string;
      fxRate: number;
      rateDate: string | null;
    } | null = null;
    if (trimmedCost !== "") {
      const parsed = Number(trimmedCost.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError(t("costNumberError"));
        return;
      }
      if (costCurrency === "DKK") {
        unitCostDkk = parsed;
      } else {
        const rate = Number(fxRateText.trim().replace(",", "."));
        if (!Number.isFinite(rate) || rate <= 0) {
          setError(t("fxRateError", { currency: costCurrency }));
          return;
        }
        unitCostForeign = {
          amount: parsed,
          currency: costCurrency,
          fxRate: rate,
          rateDate: fxLookup.kind === "ok" ? fxLookup.actualDate : null,
        };
      }
    }

    startTransition(async () => {
      const result = await adjustStock({
        partId,
        locationId,
        mode,
        value,
        reason,
        unitCostDkk,
        unitCostForeign,
        occurredAt: dateText.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("adjustStock")}</DialogTitle>
        <DialogDescription>
          {t("adjustDialogDescription", { name: partName })}
        </DialogDescription>
      </DialogHeader>

      {hideLocation ? (
        <p className="text-muted-foreground text-xs">
          {t("currentlyOnHand", {
            qty: formatQuantity(selectedLocation.currentOnHand),
          })}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adjust-location">{t("location")}</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger id="adjust-location">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}{" "}
                  <span className="text-muted-foreground">
                    {t("locationOptionMeta", {
                      code: loc.code,
                      qty: formatQuantity(loc.currentOnHand),
                    })}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {t("currentlyAtLocation", {
              qty: formatQuantity(selectedLocation.currentOnHand),
            })}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>{t("mode")}</Label>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
          className="flex gap-4"
        >
          {/* Radix RadioGroupItem renders a <button>; wrapping it in a <label>
              causes browsers to forward the click and double-toggle the state.
              Use the sibling htmlFor pattern instead. */}
          <div className="flex items-center gap-2">
            <RadioGroupItem value="delta" id="mode-delta" />
            <Label htmlFor="mode-delta" className="text-sm font-normal">
              {t("adjustByDelta")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="set" id="mode-set" />
            <Label htmlFor="mode-set" className="text-sm font-normal">
              {t("setOnHandTo")}
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adjust-value">
          {mode === "delta" ? t("deltaQty") : t("newOnHand")}
        </Label>
        <Input
          id="adjust-value"
          inputMode="decimal"
          autoFocus
          value={valueText}
          onChange={(e) => setValueText(e.target.value)}
          placeholder={mode === "delta" ? t("deltaPlaceholder") : "10"}
        />
        {preview != null ? (
          <p
            className={`text-xs tabular-nums ${
              previewIsNegative ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {mode === "delta"
              ? t("resultingOnHand", {
                  qty: formatQuantity(preview.resulting),
                })
              : t("deltaToBeWritten", {
                  qty:
                    (preview.delta > 0 ? "+" : "") +
                    formatQuantity(preview.delta),
                })}
            {previewIsNegative ? t("cannotGoBelowZero") : null}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adjust-reason">{t("reasonLabel")}</Label>
        <Textarea
          id="adjust-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("reasonPlaceholder")}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adjust-date">{t("purchaseDate")}</Label>
        <Input
          id="adjust-date"
          type="date"
          value={dateText}
          max={todayIso}
          onChange={(e) => setDateText(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {t("purchaseDateHint")}
          {costCurrency !== "DKK" ? t("fxFollowsDate") : null}
        </p>
      </div>

      {isDecrease ? (
        <p className="text-muted-foreground text-sm">
          {t("costInheritedOnDecrease")}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adjust-cost">{t("unitCostRequired")}</Label>
          <div className="flex gap-2">
            <Input
              id="adjust-cost"
              inputMode="decimal"
              value={unitCostText}
              onChange={(e) => setUnitCostText(e.target.value)}
              placeholder={t("unitCostPlaceholder")}
              className="flex-1"
            />
            {currencies.length > 0 ? (
              <Select value={costCurrency} onValueChange={setCostCurrency}>
                <SelectTrigger
                  aria-label={t("costCurrencyAria")}
                  className="w-[92px] shrink-0"
                >
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
            ) : null}
          </div>
          {costCurrency !== "DKK" ? (
            <div className="flex flex-col gap-1.5 pt-1">
              <Label htmlFor="adjust-fx">{t("fxRateLabel")}</Label>
              <Input
                id="adjust-fx"
                inputMode="decimal"
                value={fxRateText}
                onChange={(e) => setFxRateText(e.target.value)}
                placeholder={t("fxRatePlaceholder")}
              />
              <p className="text-muted-foreground text-xs">
                {fxLookup.kind === "loading"
                  ? t("fxLoading", { currency: costCurrency, date: fxDate })
                  : fxLookup.kind === "ok"
                    ? fxLookup.actualDate !== fxDate
                      ? t("fxOkClosest", {
                          date: fxLookup.actualDate,
                          requested: fxDate,
                        })
                      : t("fxOk", { date: fxLookup.actualDate })
                    : fxLookup.kind === "missing"
                      ? t("fxMissing", { message: fxLookup.message })
                      : t("fxIdle")}
              </p>
              {foreignCostDkk != null ? (
                <p className="text-xs tabular-nums">
                  {t("foreignCostPerUnit", {
                    amount: formatDkk(foreignCostDkk),
                  })}
                  <span className="text-muted-foreground">
                    {t("foreignCostNote")}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
          {prevailingCostDkk != null && costCurrency === "DKK" ? (
            <p className="text-muted-foreground text-xs">
              {t("costPrefilledHint", {
                amount: formatDkk(prevailingCostDkk),
              })}
            </p>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          {tCommon("cancel")}
        </Button>
        <Button
          type="submit"
          disabled={
            isPending ||
            reason.trim() === "" ||
            valueText.trim() === "" ||
            previewIsNegative
          }
        >
          {isPending ? tCommon("saving") : t("saveAdjustment")}
        </Button>
      </DialogFooter>
    </form>
  );
}
