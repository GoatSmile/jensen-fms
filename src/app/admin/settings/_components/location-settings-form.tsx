"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { appendField } from "@/lib/forms";

import { saveLocationSettings } from "../_actions/save-settings";

export type LocationChoice = { id: string; label: string };

type Props = {
  locations: LocationChoice[];
  initialPrimaryId: string;
  initialHide: boolean;
};

/**
 * Primary shop location + the app-wide "hide location info" toggle. Distinct
 * from the purchasing form so each section saves independently.
 */
export function LocationSettingsForm({
  locations,
  initialPrimaryId,
  initialHide,
}: Props) {
  const router = useRouter();
  const [primaryId, setPrimaryId] = useState(initialPrimaryId);
  const [hide, setHide] = useState(initialHide);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData();
    appendField(fd, "primary_location_id", primaryId);
    if (hide) fd.set("hide_location_info", "on");
    start(async () => {
      const r = await saveLocationSettings(fd);
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
        <Label htmlFor="setting-primary-location">Primary location</Label>
        <select
          id="setting-primary-location"
          value={primaryId}
          onChange={(e) => setPrimaryId(e.target.value)}
          className="border-input bg-background h-9 max-w-[340px] rounded-md border px-2 text-sm"
        >
          <option value="">— None (use first active location)</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Where parts are received into and consumed from when no location is
          picked — and the target the receive / adjust forms use while location
          info is hidden.
        </p>
      </div>

      <label className="flex max-w-prose cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={hide}
          onChange={(e) => setHide(e.target.checked)}
          className="mt-0.5 size-4"
        />
        <span className="flex flex-col">
          <span>Hide location information across the app</span>
          <span className="text-muted-foreground text-xs">
            For single-location shops. Per-location stock collapses to one total,
            the movements ledger drops its location column, and the receiving /
            stock-adjust forms hide the location picker and target the primary
            location.
          </span>
        </span>
      </label>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="text-sm text-emerald-700 dark:text-emerald-400"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save location settings"}
        </Button>
      </div>
    </form>
  );
}
