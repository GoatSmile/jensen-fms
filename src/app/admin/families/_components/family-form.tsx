"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appendField } from "@/lib/forms";

import { createFamily, updateFamily } from "../_actions/manage-families";

export type FamilyFormValues = {
  name: string;
  sort_order: string;
  is_active: boolean;
};

const EMPTY_FAMILY_FORM: FamilyFormValues = {
  name: "",
  sort_order: "100",
  is_active: true,
};

type Mode = { kind: "create" } | { kind: "edit"; id: string };

/**
 * Shared edit form for /admin/families/new and /admin/families/[id].
 * Families group bike templates (e.g. "Norma") on the templates list, ordered
 * by sort_order. Create → redirect back to the list; edit → stay + "Saved".
 */
export function FamilyForm({
  mode,
  initial,
}: {
  mode: Mode;
  /** Overrides only — unset fields fall back to EMPTY_FAMILY_FORM. */
  initial?: Partial<FamilyFormValues>;
}) {
  const router = useRouter();
  const t = useTranslations("adminFamilies");
  const tCommon = useTranslations("common");
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: FamilyFormValues = { ...EMPTY_FAMILY_FORM, ...initial };
  const [values, setValues] = useState<FamilyFormValues>(seed);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update<K extends keyof FamilyFormValues>(
    key: K,
    value: FamilyFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "name", values.name.trim());
    appendField(fd, "sort_order", values.sort_order.trim());
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
          ? await createFamily(fd)
          : await updateFamily(mode.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (mode.kind === "create") {
        router.push("/admin/families");
        router.refresh();
      } else {
        setSavedAt(new Date().toISOString());
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label={t("fieldName")} htmlFor="family-name">
        <Input
          id="family-name"
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder={t("namePlaceholder")}
          required
          autoFocus
        />
        <p className="text-muted-foreground text-xs">{t("nameHint")}</p>
      </Field>

      <Field label={t("fieldSort")} htmlFor="family-sort">
        <Input
          id="family-sort"
          type="number"
          inputMode="numeric"
          value={values.sort_order}
          onChange={(e) => update("sort_order", e.target.value)}
          className="max-w-[120px]"
        />
        <p className="text-muted-foreground text-xs">{t("sortHint")}</p>
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
            <Link href="/admin/families">{tCommon("cancel")}</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? tCommon("saving")
              : mode.kind === "create"
                ? t("addFamily")
                : t("saveChanges")}
          </Button>
        </div>
      </div>
    </form>
  );
}
