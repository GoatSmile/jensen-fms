"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appendField } from "@/lib/forms";

import { createRole, updateRole } from "../_actions/manage-roles";

export type RoleFormValues = {
  key: string;
  name_en: string;
  name_da: string;
  home_path: string;
  sort_order: string;
  is_active: boolean;
  capabilities: string[];
  events: string[];
};

const EMPTY_ROLE_FORM: RoleFormValues = {
  key: "",
  name_en: "",
  name_da: "",
  home_path: "/",
  sort_order: "100",
  is_active: true,
  capabilities: [],
  events: [],
};

type Mode = { kind: "create" } | { kind: "edit"; id: string };

/**
 * Shared form for /admin/people/roles/new and .../roles/[id]. Capability and
 * event options come pre-labelled from the server parent (registry keys +
 * localized labels); the key field is create-only — code references roles by
 * key, so it never changes after creation.
 */
export function RoleForm({
  mode,
  initial,
  capabilityOptions,
  eventOptions,
}: {
  mode: Mode;
  /** Overrides only — unset fields fall back to EMPTY_ROLE_FORM. */
  initial?: Partial<RoleFormValues>;
  capabilityOptions: { key: string; label: string }[];
  eventOptions: { key: string; label: string }[];
}) {
  const router = useRouter();
  const t = useTranslations("adminPeople");
  const tCommon = useTranslations("common");
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: RoleFormValues = { ...EMPTY_ROLE_FORM, ...initial };
  const [values, setValues] = useState<RoleFormValues>(seed);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update<K extends keyof RoleFormValues>(
    key: K,
    value: RoleFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleIn(
    field: "capabilities" | "events",
    key: string,
    checked: boolean,
  ) {
    setValues((prev) => ({
      ...prev,
      [field]: checked
        ? [...prev[field], key]
        : prev[field].filter((k) => k !== key),
    }));
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    if (mode.kind === "create") appendField(fd, "key", values.key.trim());
    appendField(fd, "name_en", values.name_en.trim());
    appendField(fd, "name_da", values.name_da.trim());
    appendField(fd, "home_path", values.home_path.trim());
    appendField(fd, "sort_order", values.sort_order.trim());
    if (values.is_active) fd.set("is_active", "on");
    for (const c of values.capabilities) fd.append("capabilities", c);
    for (const e of values.events) fd.append("events", e);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = buildFormData();
    start(async () => {
      const r =
        mode.kind === "create"
          ? await createRole(fd)
          : await updateRole(mode.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (mode.kind === "create") {
        router.push("/admin/people");
        router.refresh();
      } else {
        setSavedAt(new Date().toISOString());
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {mode.kind === "create" ? (
        <Field label={t("fieldKey")} htmlFor="role-key">
          <Input
            id="role-key"
            value={values.key}
            onChange={(e) => update("key", e.target.value)}
            placeholder={t("keyPlaceholder")}
            required
            autoFocus
          />
          <p className="text-muted-foreground text-xs">{t("keyHint")}</p>
        </Field>
      ) : (
        <Field label={t("fieldKey")} htmlFor="role-key">
          <p
            id="role-key"
            className="text-muted-foreground font-mono text-sm"
          >
            {values.key}
          </p>
        </Field>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("fieldNameEn")} htmlFor="role-name-en">
          <Input
            id="role-name-en"
            value={values.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            required
          />
        </Field>
        <Field label={t("fieldNameDa")} htmlFor="role-name-da">
          <Input
            id="role-name-da"
            value={values.name_da}
            onChange={(e) => update("name_da", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("fieldHomePath")} htmlFor="role-home">
          <Input
            id="role-home"
            value={values.home_path}
            onChange={(e) => update("home_path", e.target.value)}
            placeholder="/work"
          />
          <p className="text-muted-foreground text-xs">{t("homePathHint")}</p>
        </Field>
        <Field label={t("fieldSort")} htmlFor="role-sort">
          <Input
            id="role-sort"
            type="number"
            inputMode="numeric"
            value={values.sort_order}
            onChange={(e) => update("sort_order", e.target.value)}
            className="max-w-[120px]"
          />
          <p className="text-muted-foreground text-xs">{t("sortHint")}</p>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">
          {t("capabilitiesLegend")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {capabilityOptions.map((cap) => (
            <label
              key={cap.key}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={values.capabilities.includes(cap.key)}
                onChange={(e) =>
                  toggleIn("capabilities", cap.key, e.target.checked)
                }
                className="size-4"
              />
              {cap.label}
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{t("capabilitiesHint")}</p>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">
          {t("eventsLegend")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {eventOptions.map((evt) => (
            <label
              key={evt.key}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={values.events.includes(evt.key)}
                onChange={(e) => toggleIn("events", evt.key, e.target.checked)}
                className="size-4"
              />
              {evt.label}
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{t("eventsHint")}</p>
      </fieldset>

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
            <Link href="/admin/people">{tCommon("cancel")}</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? tCommon("saving")
              : mode.kind === "create"
                ? t("addRole")
                : t("saveChanges")}
          </Button>
        </div>
      </div>
    </form>
  );
}
