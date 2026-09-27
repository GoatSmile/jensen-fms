"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { startWorkOrderForBike } from "../_actions/start-wo";

/**
 * "New work order" for one bike, from the floor. A button that calls a server
 * action — never a `<Link>`, because a state change behind a prefetchable link
 * fires on render (CLAUDE.md, the /logout lesson). The action redirects to the
 * new order, or to the bike's already-open one.
 */
export function StartWorkOrderButton({
  bikeId,
  size = "sm",
  variant = "default",
}: {
  bikeId: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline";
}) {
  const t = useTranslations("work");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await startWorkOrderForBike(bikeId);
            // Only a refusal returns; success redirects.
            if (r && !r.ok) setError(r.error);
          });
        }}
      >
        <Wrench className="size-4" aria-hidden />
        {pending ? t("startingWorkOrder") : t("newWorkOrder")}
      </Button>
      {error ? (
        <p className="text-alert text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
