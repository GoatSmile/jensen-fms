"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { setPrimaryLocation } from "@/app/admin/locations/_actions/manage-locations";

/**
 * Per-row "Make primary" on the locations list — points
 * app_settings.primary_location_id at this location. Rendered only for
 * active, non-primary rows; the current primary shows its badge instead.
 */
export function MakePrimaryButton({ locationId }: { locationId: string }) {
  const t = useTranslations("adminLocations");
  const tCommon = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await setPrimaryLocation(locationId);
            if (!r.ok) {
              setError(r.error);
              return;
            }
          });
        }}
      >
        {pending ? tCommon("saving") : t("makePrimary")}
      </Button>
      {error ? (
        <span className="text-destructive text-xs" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
