"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";

import { setServiceTypeDefaultSupplier } from "../_actions/set-default-supplier";

/**
 * "Make default" on a price-list panel — points the service type's
 * `default_supplier_id` at THIS panel's supplier.
 *
 * **Why the action lives here and not in a dropdown of suppliers.** It replaced
 * a select listing every active supplier, which let you default to a painter with
 * no price list — silently breaking the template estimate and making new orders
 * unsendable. Rendering the control on the price list itself means the only
 * suppliers you can choose are the ones that have prices: the bad state is
 * unreachable rather than validated-against. Same move as "Make primary" on
 * locations, and the same reason.
 *
 * Rendered only on a group with a current revision, and only when it is not
 * already the default (which shows a badge instead).
 */
export function MakeDefaultButton({
  serviceTypeId,
  supplierId,
}: {
  serviceTypeId: string;
  supplierId: string;
}) {
  const router = useRouter();
  const t = useTranslations("adminServices");
  const tCommon = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await setServiceTypeDefaultSupplier(
              serviceTypeId,
              supplierId,
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <Star className="size-4" aria-hidden />
        {pending ? tCommon("saving") : t("makeDefault")}
      </Button>
      {error ? (
        <span className="text-destructive text-xs" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
