"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setLocationVisibility } from "../_actions/manage-locations";

/**
 * One-click hide/reveal of location detail across the app, on the Locations
 * screen itself. Mirrors the toggle on /admin/settings; both write the same
 * app_settings.hide_location_info flag.
 */
export function LocationVisibilityToggle({ hidden }: { hidden: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    setError(null);
    start(async () => {
      const r = await setLocationVisibility(!hidden);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  const Icon = hidden ? EyeOff : Eye;

  return (
    <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
      <div className="flex items-start gap-2.5">
        <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            Location detail is {hidden ? "hidden" : "shown"} across the app
          </span>
          <span className="text-muted-foreground text-xs">
            {hidden
              ? "Stock shows a single total, the movements ledger drops its location column, and receiving / stock-adjust target the primary location."
              : "Per-location stock, the movements location column, and the receive / stock-adjust pickers are all visible."}
          </span>
          {error ? (
            <span className="text-destructive text-xs" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={toggle}
        disabled={pending}
      >
        {pending
          ? "Saving…"
          : hidden
            ? "Show location detail"
            : "Hide location detail"}
      </Button>
    </div>
  );
}
