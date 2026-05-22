"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appendField } from "@/lib/forms";

import { saveSettings } from "../_actions/save-settings";

type Props = {
  initialDefaultTransportPct: number;
};

/**
 * The DB stores transport as a decimal (0.10 for 10 %) but the form
 * accepts and displays the percent value the user thinks in (10.2 →
 * 0.102). All conversion happens here; the action still consumes a
 * decimal so existing snapshots aren't disturbed.
 */
function decimalToPercentInput(decimal: number): string {
  // Round to 2dp to avoid floating-point sprawl (0.1 → "10", 0.102 → "10.2").
  const pct = Math.round(decimal * 10000) / 100;
  return String(pct);
}

export function SettingsForm({ initialDefaultTransportPct }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(
    decimalToPercentInput(initialDefaultTransportPct),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const pctRaw = value.trim().replace(",", ".");
    const pct = Number(pctRaw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError("Transport % must be a number between 0 and 100.");
      return;
    }
    const decimal = pct / 100;
    const fd = new FormData();
    appendField(fd, "default_transport_pct", String(decimal));
    start(async () => {
      const r = await saveSettings(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess("Saved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="setting-transport">Default transport %</Label>
        <div className="flex items-center gap-2">
          <Input
            id="setting-transport"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="10"
            required
            className="max-w-[140px]"
          />
          <span className="text-muted-foreground text-sm">%</span>
        </div>
        <p className="text-muted-foreground text-xs">
          Whole or decimal percent — e.g. <span className="font-mono">10</span>{" "}
          for 10 %, <span className="font-mono">10.2</span> for 10.2 %. New PO
          lines pre-fill this; existing lines keep their own snapshot.
        </p>
      </div>

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

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
