"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import { Label } from "@/components/ui/label";

import { setServiceTypeDefaultSupplier } from "../_actions/set-default-supplier";

type ServiceTypeRow = {
  id: string;
  name: string;
  defaultSupplierId: string | null;
};

type Props = {
  serviceTypes: ServiceTypeRow[];
  suppliers: { id: string; name: string }[];
};

/**
 * Per-service-type default supplier (migration 67) — the operational config
 * that replaced the DEFAULT_PAINTER_NAME code constant. Saves on change.
 */
export function DefaultSuppliersForm({ serviceTypes, suppliers }: Props) {
  const t = useTranslations("adminServices");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onChange(serviceTypeId: string, value: string) {
    setError(null);
    setSavedId(null);
    start(async () => {
      const r = await setServiceTypeDefaultSupplier(
        serviceTypeId,
        value || null,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedId(serviceTypeId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {serviceTypes.map((st) => (
        <div
          key={st.id}
          className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
        >
          <Label
            htmlFor={`default-supplier-${st.id}`}
            className="sm:w-40 sm:shrink-0"
          >
            {st.name}
          </Label>
          <div className="flex items-center gap-2">
            <select
              id={`default-supplier-${st.id}`}
              defaultValue={st.defaultSupplierId ?? ""}
              disabled={pending}
              onChange={(e) => onChange(st.id, e.target.value)}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">{t("noDefaultSupplier")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {savedId === st.id && !pending ? (
              <span className="inline-flex items-center gap-1 text-xs text-good">
                <Check className="size-3.5" aria-hidden />
                {t("saved")}
              </span>
            ) : null}
          </div>
        </div>
      ))}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
