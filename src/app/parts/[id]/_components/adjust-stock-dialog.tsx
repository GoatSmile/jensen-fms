"use client";

import { useMemo, useState, useTransition } from "react";
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
import { formatQuantity } from "@/lib/parts/stock";

import { adjustStock } from "../_actions/adjust-stock";

export type LocationOption = {
  id: string;
  code: string;
  name: string;
  /** Current on-hand from v_current_stock. Missing locations default to 0. */
  currentOnHand: number;
};

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
};

type Mode = "delta" | "set";

export function AdjustStockDialog({
  partId,
  partName,
  locations,
  defaultLocationId,
  triggerVariant = "default",
  hideLocation = false,
}: Props) {
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
        title="No active inventory locations on file."
      >
        {triggerVariant === "row" ? null : <PackagePlus aria-hidden />}
        Adjust stock
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerVariant === "row" ? (
          <Button size="xs" variant="ghost">
            Adjust
          </Button>
        ) : (
          <Button>
            <PackagePlus aria-hidden /> Adjust stock
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
  onSuccess,
  onCancel,
}: {
  partId: string;
  partName: string;
  locations: LocationOption[];
  defaultLocationId?: string;
  hideLocation: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [locationId, setLocationId] = useState(
    defaultLocationId ?? locations[0]!.id,
  );
  const [mode, setMode] = useState<Mode>("delta");
  const [valueText, setValueText] = useState("");
  const [reason, setReason] = useState("");
  const [unitCostText, setUnitCostText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const value = Number(valueText);
    if (!Number.isFinite(value)) {
      setError("Enter a number for the quantity.");
      return;
    }

    const trimmedCost = unitCostText.trim();
    let unitCostDkk: number | null = null;
    if (trimmedCost !== "") {
      const parsed = Number(trimmedCost);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Unit cost must be a non-negative number, or empty.");
        return;
      }
      unitCostDkk = parsed;
    }

    startTransition(async () => {
      const result = await adjustStock({
        partId,
        locationId,
        mode,
        value,
        reason,
        unitCostDkk,
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
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogDescription>
          {partName} — appends one entry to the inventory ledger. Past entries
          are never modified.
        </DialogDescription>
      </DialogHeader>

      {hideLocation ? (
        <p className="text-muted-foreground text-xs">
          Currently {formatQuantity(selectedLocation.currentOnHand)} on hand.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adjust-location">Location</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger id="adjust-location">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}{" "}
                  <span className="text-muted-foreground">
                    ({loc.code} · {formatQuantity(loc.currentOnHand)} on hand)
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Currently {formatQuantity(selectedLocation.currentOnHand)} at this
            location.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>Mode</Label>
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
              Adjust by Δ
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="set" id="mode-set" />
            <Label htmlFor="mode-set" className="text-sm font-normal">
              Set on-hand to…
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adjust-value">
          {mode === "delta" ? "Δ quantity" : "New on-hand"}
        </Label>
        <Input
          id="adjust-value"
          inputMode="decimal"
          autoFocus
          value={valueText}
          onChange={(e) => setValueText(e.target.value)}
          placeholder={mode === "delta" ? "-2 or +5" : "10"}
        />
        {preview != null ? (
          <p
            className={`text-xs tabular-nums ${
              previewIsNegative
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {mode === "delta" ? (
              <>Resulting on-hand: {formatQuantity(preview.resulting)}</>
            ) : (
              <>
                Δ to be written: {preview.delta > 0 ? "+" : ""}
                {formatQuantity(preview.delta)}
              </>
            )}
            {previewIsNegative ? " — cannot go below zero" : null}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adjust-reason">Reason</Label>
        <Textarea
          id="adjust-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. physical count 2026-05-08, found in another box"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adjust-cost">Unit cost (DKK, optional)</Label>
        <Input
          id="adjust-cost"
          inputMode="decimal"
          value={unitCostText}
          onChange={(e) => setUnitCostText(e.target.value)}
          placeholder="Leave blank when removing stock"
        />
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
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
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
          {isPending ? "Saving…" : "Save adjustment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
