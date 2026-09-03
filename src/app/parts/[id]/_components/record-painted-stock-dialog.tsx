"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import { Field } from "@/components/field";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ColorSwatch } from "@/components/color-swatch";
import { COATINGS, colorFinishLabel } from "@/lib/colors/coating";
import { localizedName } from "@/i18n/vocab";
import { formatPrice } from "@/lib/format";
import { resolveTierItem, type ServicePriceItem } from "@/lib/services/pricing";

import { createColourInline } from "@/app/_actions/create-colour";
import { recordPaintedStock } from "../_actions/record-painted-stock";
import type { LocationOption } from "./adjust-stock-dialog";

export type ColourChoice = {
  id: string;
  name_en: string;
  name_da: string;
  hex: string | null;
  ral_code: string | null;
  coating: string | null;
};

type Props = {
  basePartId: string;
  basePartSku: string;
  locations: LocationOption[];
  primaryLocationId: string | null;
  hideLocations: boolean;
  colours: ColourChoice[];
  /** Colours that already have a variant of this part — shown, but flagged. */
  existingVariantColourIds: string[];
  /** The base part's prevailing cost, the raw half of the pre-filled figure. */
  rawCostDkk: number | null;
  /**
   * The painter's current price rows for THIS part's painter type, so the
   * pre-filled cost tracks the quantity's tier. Empty when the part is
   * unmarked, no default painter is set, or the list is not in DKK.
   */
  paintPriceItems: ServicePriceItem[];
  /** Which painter type those rows price — the tier basis needs it by id. */
  paintPartTypeId: string | null;
  paintPriceListLabel: string | null;
  /** Whether this person may create a colour (the `admin` capability). */
  mayCreateColour: boolean;
};

/**
 * Record painted stock the shop already owns — the second and only other door
 * to a painted variant besides a paint order coming back.
 *
 * Two deliberate shapes here:
 *
 * 1. **"Take these off the raw count too?" is never pre-answered.** Both answers
 *    are right in different situations and the wrong one is silent — see
 *    `recordPaintedStock`. Submit stays disabled until one is chosen, because a
 *    default would be guessed by everyone and read by no one.
 * 2. **A colour can be created here**, gated on `admin`, and the form shows
 *    existing colours matching what is being typed BEFORE offering to create.
 *    The unique slug already refuses a second "Red"; what it accepts is "Rød"
 *    beside "Red" — same paint, two rows — and a variant keyed to the wrong
 *    twin can never be matched to an order. Near-matches are the guardrail that
 *    matters; a mandatory RAL is not, since nobody knows the RAL of something
 *    painted two years ago.
 */
export function RecordPaintedStockDialog({
  basePartId,
  basePartSku,
  locations,
  primaryLocationId,
  hideLocations,
  colours,
  existingVariantColourIds,
  rawCostDkk,
  paintPriceItems,
  paintPartTypeId,
  paintPriceListLabel,
  mayCreateColour,
}: Props) {
  const t = useTranslations("parts");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [colourId, setColourId] = useState("");
  const [locationId, setLocationId] = useState(
    hideLocations ? (primaryLocationId ?? "") : "",
  );
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [costTouched, setCostTouched] = useState(false);
  const [reason, setReason] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  // null until answered — see the doctrine note above.
  const [takeOffRaw, setTakeOffRaw] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // --- inline colour creation ---
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRal, setNewRal] = useState("");
  const [newCoating, setNewCoating] = useState("");
  const [colourList, setColourList] = useState(colours);

  const existing = useMemo(
    () => new Set(existingVariantColourIds),
    [existingVariantColourIds],
  );

  const qtyNum = Number(qty.replace(",", "."));
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0;

  // Pre-filled cost = the raw part's prevailing cost + what the painter charges
  // for this part type at THIS quantity's tier. Recomputed as the quantity
  // moves, until the user types their own figure. Nobody should have to invent
  // this number.
  const suggested = useMemo(() => {
    if (rawCostDkk == null) return null;
    // The paint half is tiered on quantity, so it cannot be resolved before a
    // quantity exists. That is a DIFFERENT state from "this painter has no
    // price for this part type", and saying the latter while the field is
    // simply empty is a false explanation — it read as a broken price list.
    const hasList = paintPriceItems.length > 0 && !!paintPartTypeId;
    const tier =
      hasList && qtyValid
        ? resolveTierItem(paintPriceItems, paintPartTypeId, qtyNum)
        : null;
    const paint = tier?.unit_price ?? null;
    return {
      raw: rawCostDkk,
      paint,
      /** Why there is no paint half yet, when there isn't one. */
      pending: hasList && !qtyValid,
      hasList,
      total: rawCostDkk + (paint ?? 0),
    };
  }, [rawCostDkk, paintPriceItems, paintPartTypeId, qtyNum, qtyValid]);

  const effectiveCost = costTouched ? cost : (suggested?.total?.toFixed(4) ?? "");

  const nearMatches = useMemo(() => {
    const q = newName.trim().toLowerCase();
    if (q.length < 2) return [];
    return colourList.filter(
      (c) =>
        c.name_en.toLowerCase().includes(q) ||
        c.name_da.toLowerCase().includes(q) ||
        q.includes(c.name_en.toLowerCase()) ||
        q.includes(c.name_da.toLowerCase()),
    );
  }, [newName, colourList]);

  function reset() {
    setColourId("");
    setQty("");
    setCost("");
    setCostTouched(false);
    setReason("");
    setOccurredOn("");
    setTakeOffRaw(null);
    setError(null);
    setCreating(false);
    setNewName("");
    setNewRal("");
    setNewCoating("");
  }

  function runCreateColour() {
    setError(null);
    start(async () => {
      const r = await createColourInline({
        nameEn: newName,
        nameDa: null,
        ralCode: newRal || null,
        coating: newCoating || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setColourList((prev) =>
        [
          ...prev,
          {
            id: r.id,
            name_en: r.nameEn,
            name_da: r.nameDa,
            hex: r.hex,
            ral_code: newRal || null,
            coating: newCoating || null,
          },
        ].sort((a, b) => a.name_en.localeCompare(b.name_en)),
      );
      setColourId(r.id);
      setCreating(false);
      setNewName("");
      setNewRal("");
      setNewCoating("");
    });
  }

  const canSubmit =
    !!colourId &&
    !!locationId &&
    qtyValid &&
    effectiveCost !== "" &&
    reason.trim() !== "" &&
    takeOffRaw !== null;

  function onSubmit() {
    setError(null);
    start(async () => {
      const r = await recordPaintedStock({
        basePartId,
        colorId: colourId,
        locationId,
        quantity: qtyNum,
        unitCostDkk: Number(effectiveCost.replace(",", ".")),
        reason: reason.trim(),
        occurredOn: occurredOn || null,
        takeOffRaw: takeOffRaw === true,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus aria-hidden /> {t("recordPaintedCta")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("recordPaintedTitle")}</DialogTitle>
          <DialogDescription>
            {t("recordPaintedDesc", { sku: basePartSku })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Colour, with inline creation for a colour we have never ordered. */}
          {creating ? (
            <div className="bg-ground flex flex-col gap-3 rounded-lg p-3">
              <Field label={t("newColourName")} htmlFor="new-colour-name" required>
                <Input
                  id="new-colour-name"
                  // Focus it: you press "New colour…" in order to type a name,
                  // and without this the keystrokes land in whichever field
                  // was last focused (they went into the quantity, giving
                  // "3Red", when this was first tried).
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("newColourNamePlaceholder")}
                />
              </Field>
              {nearMatches.length > 0 ? (
                <div className="text-money flex flex-col gap-1 text-xs">
                  <span>{t("newColourNearMatch")}</span>
                  <div className="flex flex-wrap gap-2">
                    {nearMatches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="bg-surface hover:bg-muted flex items-center gap-1.5 rounded-full px-2 py-1"
                        onClick={() => {
                          setColourId(c.id);
                          setCreating(false);
                          setNewName("");
                        }}
                      >
                        <ColorSwatch
                          hex={c.hex}
                          label={localizedName(locale, c.name_en, c.name_da)}
                        />
                        {localizedName(locale, c.name_en, c.name_da)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("newColourRal")} htmlFor="new-colour-ral">
                  <Input
                    id="new-colour-ral"
                    value={newRal}
                    onChange={(e) => setNewRal(e.target.value)}
                    placeholder="1006"
                  />
                </Field>
                <Field label={t("newColourCoating")} htmlFor="new-colour-coating">
                  <Select value={newCoating} onValueChange={setNewCoating}>
                    <SelectTrigger id="new-colour-coating">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {COATINGS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <p className="text-ink-2 text-xs">{t("newColourRalHint")}</p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                  disabled={pending}
                >
                  {tc("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={runCreateColour}
                  disabled={pending || newName.trim() === ""}
                >
                  {t("newColourCreate")}
                </Button>
              </div>
            </div>
          ) : (
            <Field label={t("recordPaintedColour")} htmlFor="painted-colour" required>
              <div className="flex items-center gap-2">
                <Select value={colourId} onValueChange={setColourId}>
                  <SelectTrigger id="painted-colour" className="flex-1">
                    <SelectValue placeholder={t("recordPaintedPickColour")} />
                  </SelectTrigger>
                  <SelectContent>
                    {colourList.map((c) => {
                      const label = localizedName(locale, c.name_en, c.name_da);
                      const finish = colorFinishLabel(
                        c.ral_code,
                        c.coating,
                        locale === "da" ? "da" : "en",
                      );
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          <ColorSwatch hex={c.hex} label={label} />
                          {label}
                          {finish ? (
                            <span className="text-muted-foreground ml-1.5 text-xs">
                              {finish}
                            </span>
                          ) : null}
                          {existing.has(c.id) ? (
                            <span className="text-muted-foreground ml-1.5 text-xs">
                              {t("recordPaintedAlreadyOnShelf")}
                            </span>
                          ) : null}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {mayCreateColour ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreating(true)}
                  >
                    {t("newColourCta")}
                  </Button>
                ) : null}
              </div>
              {!mayCreateColour ? (
                <span className="text-ink-2 text-xs">
                  {t("newColourNeedsAdmin")}
                </span>
              ) : null}
            </Field>
          )}

          {!hideLocations ? (
            <Field label={t("recordPaintedLocation")} htmlFor="painted-location" required>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="painted-location">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field label={t("recordPaintedQty")} htmlFor="painted-qty" required>
            <Input
              id="painted-qty"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              placeholder="3"
            />
          </Field>

          <Field label={t("recordPaintedCost")} htmlFor="painted-cost" required>
            <Input
              id="painted-cost"
              value={effectiveCost}
              onChange={(e) => {
                setCostTouched(true);
                setCost(e.target.value);
              }}
              inputMode="decimal"
            />
            <span className="text-ink-2 text-xs">
              {suggested == null
                ? t("recordPaintedCostNoRaw")
                : suggested.pending
                  ? t("recordPaintedCostNeedQty", {
                      raw: formatPrice(suggested.raw, "DKK"),
                      list: paintPriceListLabel ?? "—",
                    })
                  : suggested.paint == null
                    ? t("recordPaintedCostRawOnly", {
                        raw: formatPrice(suggested.raw, "DKK"),
                      })
                    : t("recordPaintedCostBreakdown", {
                        raw: formatPrice(suggested.raw, "DKK"),
                        paint: formatPrice(suggested.paint, "DKK"),
                        list: paintPriceListLabel ?? "—",
                      })}
            </span>
          </Field>

          {/* The question with no default. */}
          <div className="bg-ground flex flex-col gap-2 rounded-lg p-3">
            <Label className="flex-col items-start gap-0.5">
              <span>{t("takeOffRawQuestion")}</span>
            </Label>
            <p className="text-ink-2 text-xs">{t("takeOffRawHelp")}</p>
            <div className="flex flex-col gap-1.5">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="take-off-raw"
                  className="mt-1 accent-primary"
                  checked={takeOffRaw === true}
                  onChange={() => setTakeOffRaw(true)}
                />
                <span>{t("takeOffRawYes")}</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="take-off-raw"
                  className="mt-1 accent-primary"
                  checked={takeOffRaw === false}
                  onChange={() => setTakeOffRaw(false)}
                />
                <span>{t("takeOffRawNo")}</span>
              </label>
            </div>
          </div>

          <Field label={t("recordPaintedReason")} htmlFor="painted-reason" required>
            <Textarea
              id="painted-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("recordPaintedReasonPlaceholder")}
            />
          </Field>

          <Field label={t("recordPaintedDate")} htmlFor="painted-date">
            <Input
              id="painted-date"
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
            <span className="text-ink-2 text-xs">{t("recordPaintedDateHint")}</span>
          </Field>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            {tc("cancel")}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending || !canSubmit}>
            {t("recordPaintedSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
