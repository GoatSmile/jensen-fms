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
import { appendField } from "@/lib/forms";
import { Money } from "@/components/money";
import { formatMoney } from "@/lib/parts/format";

import { addPartToWO } from "../_actions/manage-wo-parts";

export type PartChoice = {
  id: string;
  internal_sku: string;
  name_en: string;
  category_name: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  woId: string;
  parts: PartChoice[];
  /** Already-on-WO part ids to disable in the picker. */
  excludeIds: Set<string>;
  /** Retail (customer) price per part, used to prefill unit_price. */
  retailByPartId: Map<string, number>;
};

export function WOPartDialog({
  open,
  onOpenChange,
  woId,
  parts,
  excludeIds,
  retailByPartId,
}: Props) {
  const t = useTranslations("workOrders");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [partId, setPartId] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  // Tracks whether the user has hand-edited unit_price; if so, picking a
  // different part should NOT clobber their override.
  const [unitPriceTouched, setUnitPriceTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedNote, setAddedNote] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parts;
    return parts.filter((p) =>
      [p.internal_sku, p.name_en, p.category_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [parts, filter]);

  // Auto-prefill the unit price from the part's retail price when the
  // picker changes — WO parts bill at retail.
  useEffect(() => {
    if (!partId || unitPriceTouched) return;
    const last = retailByPartId.get(partId);
    setUnitPrice(last != null ? String(last) : "");
  }, [partId, retailByPartId, unitPriceTouched]);

  function reset() {
    setFilter("");
    setPartId("");
    setQty("1");
    setUnitPrice("");
    setUnitPriceTouched(false);
    setError(null);
    setAddedNote(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const qtyN = Number(qty);
  const unitPriceN = unitPrice.trim() === "" ? null : Number(unitPrice);
  const previewTotal =
    Number.isFinite(qtyN) && qtyN > 0 && unitPriceN != null && Number.isFinite(unitPriceN)
      ? qtyN * unitPriceN
      : null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!partId) {
      setError(t("pickPartError"));
      return;
    }
    if (!Number.isFinite(qtyN) || qtyN <= 0) {
      setError(t("qtyError"));
      return;
    }
    if (unitPrice.trim() !== "" && (!Number.isFinite(unitPriceN!) || unitPriceN! < 0)) {
      setError(t("unitPriceError"));
      return;
    }
    start(async () => {
      const fd = new FormData();
      appendField(fd, "part_id", partId);
      appendField(fd, "quantity", String(qtyN));
      if (unitPrice.trim() !== "") {
        appendField(fd, "unit_price", String(unitPriceN));
      }
      const r = await addPartToWO(woId, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Stay open for the next part — reset the picks but keep the filter,
      // so adding several parts from one search is one fluid session.
      const added = parts.find((p) => p.id === partId);
      setPartId("");
      setQty("1");
      setUnitPrice("");
      setUnitPriceTouched(false);
      setAddedNote(
        added ? t("addedNote", { name: added.name_en }) : t("partAdded"),
      );
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDesc")}</DialogDescription>
          </DialogHeader>

          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filterParts")}
          />

          <div className="bg-ground max-h-60 overflow-y-auto rounded-lg">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground p-3 text-center text-sm">
                {t("noPartsMatch")}
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map((p) => {
                  const disabled = excludeIds.has(p.id);
                  const isPicked = partId === p.id;
                  const last = retailByPartId.get(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPartId(p.id);
                          setUnitPriceTouched(false);
                        }}
                        disabled={disabled}
                        className={`hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                          isPicked ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{p.name_en}</span>
                          <span className="text-muted-foreground font-mono text-xs">
                            {p.internal_sku}
                            {p.category_name ? (
                              <span className="ml-2">· {p.category_name}</span>
                            ) : null}
                          </span>
                        </div>
                        <div className="text-right">
                          {disabled ? (
                            <span className="text-muted-foreground text-xs">
                              {t("alreadyOnWo")}
                            </span>
                          ) : last != null ? (
                            <span className="text-muted-foreground text-xs">
                              {t("retail")}{" "}
                              <Money
                                amount={last}
                                currency="DKK"
                                bold={false}
                              />
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wo-part-qty">{t("quantity")}</Label>
              <Input
                id="wo-part-qty"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wo-part-unit-price">{t("unitPriceLabel")}</Label>
              <Input
                id="wo-part-unit-price"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => {
                  setUnitPrice(e.target.value);
                  setUnitPriceTouched(true);
                }}
                placeholder={t("unitPricePlaceholder")}
              />
            </div>
          </div>

          {previewTotal != null ? (
            <p className="text-muted-foreground text-xs">
              {t("pricePreview", {
                qty: qtyN,
                unit: formatMoney(unitPriceN!, "DKK"),
                total: formatMoney(previewTotal, "DKK"),
              })}
            </p>
          ) : null}

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          {addedNote && !error ? (
            <p
              className="text-sm text-good"
              role="status"
            >
              {addedNote}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {addedNote ? t("done") : tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !partId || qty.trim() === ""}
            >
              {isPending ? t("adding") : t("addPart")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
