"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appendField } from "@/lib/forms";
import { formatPct } from "@/lib/parts/format";

import { saveSettings } from "../_actions/save-settings";

type Props = {
  initialDefaultTransportPct: number;
};

export function SettingsForm({ initialDefaultTransportPct }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(String(initialDefaultTransportPct));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const previewPct = (() => {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
  })();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    appendField(fd, "default_transport_pct", value.trim().replace(",", "."));
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
        <Label htmlFor="setting-transport">
          Default transport % (decimal)
        </Label>
        <Input
          id="setting-transport"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0.10"
          required
          className="max-w-[180px]"
        />
        <p className="text-muted-foreground text-xs">
          Enter as a decimal — <span className="font-mono">0.10</span> for 10 %.
          New PO lines pre-fill this; existing lines keep their own snapshot.
          {previewPct != null ? (
            <>
              {" "}
              Preview: <strong>{formatPct(previewPct)}</strong>.
            </>
          ) : null}
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
