"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
    <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
      <div className="flex items-start gap-2.5">
        <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {hidden ? t("visibilityTitleHidden") : t("visibilityTitleShown")}
          </span>
          <span className="text-muted-foreground text-xs">
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
