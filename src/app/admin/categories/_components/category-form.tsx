"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { appendField } from "@/lib/forms";

import { createCategory, updateCategory } from "../_actions/manage-categories";

export type CategoryFormValues = {
  name_en: string;
  name_da: string;
  parent_id: string;
  description_en: string;
  description_da: string;
  sort_order: string;
  is_active: boolean;
};

export const EMPTY_CATEGORY_FORM: CategoryFormValues = {
  name_en: "",
  name_da: "",
  parent_id: "",
  description_en: "",
  description_da: "",
  sort_order: "0",
  is_active: true,
};

/** Flat parent options, label already indented for nesting depth. */
export type ParentOption = { id: string; label: string };

type Mode = { kind: "create" } | { kind: "edit"; id: string };

type Props = {
  mode: Mode;
  initial: CategoryFormValues;
  parentOptions: ParentOption[];
};

export function CategoryForm({ mode, initial, parentOptions }: Props) {
  const t = useTranslations("adminCategories");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [values, setValues] = useState<CategoryFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update<K extends keyof CategoryFormValues>(
    key: K,
    value: CategoryFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "name_en", values.name_en.trim());
    appendField(fd, "name_da", values.name_da.trim());
    appendField(fd, "parent_id", values.parent_id);
    appendField(fd, "description_en", values.description_en.trim());
    appendField(fd, "description_da", values.description_da.trim());
    appendField(fd, "sort_order", values.sort_order.trim() || "0");
    if (values.is_active) fd.set("is_active", "on");
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!values.name_en.trim()) {
      setError(t("nameRequired"));
      return;
    }
    const fd = buildFormData();
    start(async () => {
      const r =
        mode.kind === "create"
          ? await createCategory(fd)
          : await updateCategory(mode.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (mode.kind === "create") {
        router.push("/admin/categories");
        router.refresh();
      } else {
        setSavedAt(new Date().toISOString());
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label={t("nameEn")} htmlFor="cat-name-en">
        <Input
          id="cat-name-en"
          value={values.name_en}
          onChange={(e) => update("name_en", e.target.value)}
          placeholder={t("nameEnPlaceholder")}
          required
        />
      </Field>

      <Field label={t("nameDa")} htmlFor="cat-name-da">
        <Input
          id="cat-name-da"
          value={values.name_da}
          onChange={(e) => update("name_da", e.target.value)}
          placeholder={t("nameDaPlaceholder")}
        />
      </Field>

      <Field label={t("parentCategory")} htmlFor="cat-parent">
        <select
          id="cat-parent"
          value={values.parent_id}
          onChange={(e) => update("parent_id", e.target.value)}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="">{t("topLevelOption")}</option>
          {parentOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">{t("parentHint")}</p>
      </Field>

      <Field label={t("descriptionEn")} htmlFor="cat-desc-en">
        <Textarea
          id="cat-desc-en"
          rows={2}
          value={values.description_en}
          onChange={(e) => update("description_en", e.target.value)}
          placeholder={t("descriptionEnPlaceholder")}
        />
      </Field>

      <Field label={t("descriptionDa")} htmlFor="cat-desc-da">
        <Textarea
          id="cat-desc-da"
          rows={2}
          value={values.description_da}
          onChange={(e) => update("description_da", e.target.value)}
          placeholder={t("descriptionDaPlaceholder")}
        />
      </Field>

      <Field label={t("sortOrder")} htmlFor="cat-sort">
        <Input
          id="cat-sort"
          inputMode="numeric"
          value={values.sort_order}
          onChange={(e) => update("sort_order", e.target.value)}
          placeholder="0"
          className="max-w-[160px]"
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
            <Link href="/admin/categories">{tCommon("cancel")}</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? tCommon("saving")
              : mode.kind === "create"
                ? t("addCategory")
                : t("saveChanges")}
          </Button>
        </div>
      </div>
    </form>
  );
}
