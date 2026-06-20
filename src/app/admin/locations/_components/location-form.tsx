"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
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

export const EMPTY_LOCATION_FORM: LocationFormValues = {
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
  initial: LocationFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<LocationFormValues>(initial);
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
      <Field label="Code" htmlFor="location-code">
        <Input
          id="location-code"
          value={values.code}
          onChange={(e) => update("code", e.target.value)}
          placeholder="e.g. WH-MAIN"
          className="max-w-[200px] font-mono"
          required
        />
        <p className="text-muted-foreground text-xs">
          Short stable identifier shown on movements and receiving.
        </p>
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name (English)" htmlFor="location-name-en">
          <Input
            id="location-name-en"
            value={values.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            placeholder="e.g. Main Warehouse"
            required
          />
        </Field>
        <Field label="Name (Dansk)" htmlFor="location-name-da">
          <Input
            id="location-name-da"
            value={values.name_da}
            onChange={(e) => update("name_da", e.target.value)}
            placeholder="(falls back to English if blank)"
          />
        </Field>
      </div>

      <Field label="Address" htmlFor="location-address">
        <Input
          id="location-address"
          value={values.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder="e.g. Ellekær 3, 2730 Herlev"
        />
        <p className="text-muted-foreground text-xs">Optional.</p>
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(e) => update("is_active", e.target.checked)}
          className="size-4"
        />
        Active (visible in location pickers)
      </label>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="bg-card flex items-center justify-between gap-2 rounded-md border p-3">
        <span className="text-muted-foreground text-xs">
          {savedAt
            ? `Saved · ${new Date(savedAt).toLocaleTimeString("da-DK")}`
            : mode.kind === "create"
              ? "Not yet saved"
              : "Up to date"}
        </span>
        <div className="flex gap-2">
          <Button asChild type="button" variant="outline" disabled={pending}>
            <Link href="/admin/locations">Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : mode.kind === "create"
                ? "Add location"
                : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
