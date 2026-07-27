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

import {
  createCustomerSegment,
  updateCustomerSegment,
} from "../_actions/manage-customer-segments";

export type SegmentFormValues = {
  name_en: string;
  name_da: string;
  slug: string;
  description_en: string;
  description_da: string;
  sort_order: string;
  is_active: boolean;
};

const EMPTY_SEGMENT_FORM: SegmentFormValues = {
  name_en: "",
  name_da: "",
  slug: "",
  description_en: "",
  description_da: "",
  sort_order: "100",
  is_active: true,
};

type Mode = { kind: "create" } | { kind: "edit"; id: string };

type Props = {
  mode: Mode;
  /** Overrides only — unset fields fall back to EMPTY_SEGMENT_FORM. */
  initial?: Partial<SegmentFormValues>;
};

export function SegmentForm({ mode, initial }: Props) {
  const t = useTranslations("adminSegments");
  const tCommon = useTranslations("common");
  const router = useRouter();
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: SegmentFormValues = { ...EMPTY_SEGMENT_FORM, ...initial };
  const [values, setValues] = useState<SegmentFormValues>(seed);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update<K extends keyof SegmentFormValues>(
    key: K,
    value: SegmentFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "name_en", values.name_en.trim());
    appendField(fd, "name_da", values.name_da.trim());
    appendField(fd, "slug", values.slug.trim());
    appendField(fd, "description_en", values.description_en.trim());
    appendField(fd, "description_da", values.description_da.trim());
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
          ? await createCustomerSegment(fd)
          : await updateCustomerSegment(mode.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (mode.kind === "create") {
        router.push("/admin/customer-segments");
        router.refresh();
      } else {
        setSavedAt(new Date().toISOString());
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("nameEn")} htmlFor="seg-name-en">
          <Input
            id="seg-name-en"
            value={values.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            placeholder={t("nameEnPlaceholder")}
            required
          />
        </Field>
        <Field label={t("nameDa")} htmlFor="seg-name-da">
          <Input
            id="seg-name-da"
            value={values.name_da}
            onChange={(e) => update("name_da", e.target.value)}
            placeholder={t("nameDaPlaceholder")}
          />
        </Field>
      </div>

      <Field label={t("slug")} htmlFor="seg-slug">
        <Input
          id="seg-slug"
          value={values.slug}
          onChange={(e) => update("slug", e.target.value)}
          placeholder={t("slugPlaceholder")}
          className="font-mono"
        />
        <p className="text-muted-foreground text-xs">{t("slugHint")}</p>
      </Field>

      <Field label={t("descriptionEn")} htmlFor="seg-desc-en">
        <Textarea
          id="seg-desc-en"
          rows={2}
          value={values.description_en}
          onChange={(e) => update("description_en", e.target.value)}
          placeholder={t("descriptionEnPlaceholder")}
        />
      </Field>

      <Field label={t("descriptionDa")} htmlFor="seg-desc-da">
        <Textarea
          id="seg-desc-da"
          rows={2}
          value={values.description_da}
          onChange={(e) => update("description_da", e.target.value)}
          placeholder={t("descriptionDaPlaceholder")}
        />
      </Field>

      <Field label={t("sortOrder")} htmlFor="seg-sort">
        <Input
          id="seg-sort"
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
            <Link href="/admin/customer-segments">{tCommon("cancel")}</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? tCommon("saving")
              : mode.kind === "create"
                ? t("addSegment")
                : t("saveChanges")}
          </Button>
        </div>
      </div>
    </form>
  );
}

