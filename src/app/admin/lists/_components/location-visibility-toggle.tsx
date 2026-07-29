"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setLocationVisibility } from "@/app/admin/locations/_actions/manage-locations";

/**
 * One-click hide/reveal of location detail across the app, above the Stock
 * locations list on `/admin/lists`.
 *
 * **This is the only control for `app_settings.hide_location_info`.** An earlier
 * version of this docstring said it mirrored a toggle on `/admin/settings` —
 * there is no such toggle (checked 2026-07-29), which is why porting it here
 * when `/admin/locations` was retired mattered: redirecting without it would
 * have left the flag unreachable from the UI.
 *
 * Renders as an in-panel well (`bg-ground`), not the `bg-card`-plus-border box
 * it was: it now sits inside a `Panel`, and a bordered card in there is the card
 * soup the panel convention replaced.
 */
export function LocationVisibilityToggle({ hidden }: { hidden: boolean }) {
  const router = useRouter();
  const t = useTranslations("adminLocations");
  const tCommon = useTranslations("common");
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
    <div className="bg-ground flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
      <div className="flex items-start gap-2.5">
        <Icon className="text-ink-2 mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {hidden ? t("visibilityTitleHidden") : t("visibilityTitleShown")}
          </span>
          <span className="text-ink-2 text-xs">
            {hidden ? t("visibilityHiddenDesc") : t("visibilityShownDesc")}
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
          ? tCommon("saving")
          : hidden
            ? t("showDetail")
            : t("hideDetail")}
      </Button>
    </div>
  );
}
