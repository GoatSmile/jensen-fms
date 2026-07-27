"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appendField } from "@/lib/forms";

import { createLocation, updateLocation } from "../_actions/manage-locations";

export type LocationFormValues = {
  code: string;
  name_en: string;
  name_da: string;
  address: string;
  is_active: boolean;
};

const EMPTY_LOCATION_FORM: LocationFormValues = {
  code: "",
  name_en: "",
  name_da: "",
  address: "",
  is_active: true,
};

type Mode = { kind: "create" } | { kind: "edit"; id: string };

/**
 * Shared edit form for /admin/locations/new and /admin/locations/[id], mirroring
 * the colours CRUD. Create → redirect back to the list; edit → stay and show a
 * "Saved" marker.
 */
export function LocationForm({
  mode,
  initial,
}: {
  mode: Mode;
  /** Overrides only — unset fields fall back to EMPTY_LOCATION_FORM. */
  initial?: Partial<LocationFormValues>;
}) {
  const router = useRouter();
  const t = useTranslations("adminLocations");
  const tCommon = useTranslations("common");
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: LocationFormValues = { ...EMPTY_LOCATION_FORM, ...initial };
  const [values, setValues] = useState<LocationFormValues>(seed);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update<K extends keyof LocationFormValues>(
    key: K,
    value: LocationFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "code", values.code.trim());
    appendField(fd, "name_en", values.name_en.trim());
    appendField(fd, "name_da", values.name_da.trim());
    appendField(fd, "address", values.address.trim());
    if (values.is_active) fd.set("is_active", "on");
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = buildFormData();
    start(async () => {
      const r =
        mode.kind === "create"
          ? await createLocation(fd)
          : await updateLocation(mode.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (mode.kind === "create") {
        router.push("/admin/locations");
        router.refresh();
      } else {
        setSavedAt(new Date().toISOString());
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label={t("fieldCode")} htmlFor="location-code">
        <Input
          id="location-code"
          value={values.code}
          onChange={(e) => update("code", e.target.value)}
          placeholder={t("codePlaceholder")}
          className="max-w-[200px] font-mono"
          required
        />
        <p className="text-muted-foreground text-xs">{t("codeHint")}</p>
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("fieldNameEn")} htmlFor="location-name-en">
          <Input
            id="location-name-en"
            value={values.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            placeholder={t("nameEnPlaceholder")}
            required
          />
        </Field>
        <Field label={t("fieldNameDa")} htmlFor="location-name-da">
          <Input
            id="location-name-da"
            value={values.name_da}
            onChange={(e) => update("name_da", e.target.value)}
            placeholder={t("nameDaPlaceholder")}
          />
        </Field>
      </div>

      <Field label={t("fieldAddress")} htmlFor="location-address">
        <Input
          id="location-address"
          value={values.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder={t("addressPlaceholder")}
        />
        <p className="text-muted-foreground text-xs">{t("addressHint")}</p>
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(e) => update("is_active", e.target.checked)}
          className="size-4"
        />
        {t("activeLabel")}
      </label>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="bg-card flex items-center justify-between gap-2 rounded-md border p-3">
        <span className="text-muted-foreground text-xs">
          {savedAt
            ? t("savedAt", {
                time: new Date(savedAt).toLocaleTimeString("da-DK"),
              })
            : mode.kind === "create"
              ? t("notYetSaved")
              : t("upToDate")}
        </span>
        <div className="flex gap-2">
          <Button asChild type="button" variant="outline" disabled={pending}>
            <Link href="/admin/locations">{tCommon("cancel")}</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? tCommon("saving")
              : mode.kind === "create"
                ? t("addLocation")
                : t("saveChanges")}
          </Button>
        </div>
      </div>
    </form>
  );
}
