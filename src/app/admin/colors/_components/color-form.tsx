"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { FormSaveBar } from "@/components/form-save-bar";
import { ColorSwatch } from "@/components/color-swatch";
import { Input } from "@/components/ui/input";
import { appendField } from "@/lib/forms";
import { coatingLabel } from "@/lib/colors/coating";
import { ralToHex } from "@/lib/colors/ral";

import { createColor, updateColor } from "../_actions/manage-colors";

export type ColorFormValues = {
  name_en: string;
  name_da: string;
  slug: string;
  hex: string;
  ral_code: string;
  coating: string;
  sort_order: string;
  is_active: boolean;
};

const EMPTY_COLOR_FORM: ColorFormValues = {
  name_en: "",
  name_da: "",
  slug: "",
  hex: "",
  ral_code: "",
  coating: "",
  sort_order: "100",
  is_active: true,
};

type Mode = { kind: "create" } | { kind: "edit"; id: string };

export type CoatingChoice = { slug: string; label: string };

type Props = {
  mode: Mode;
  /** Overrides only — unset fields fall back to EMPTY_COLOR_FORM. */
  initial?: Partial<ColorFormValues>;
  /** Active coating finishes from the managed vocab (admin/colors). */
  coatings: CoatingChoice[];
};

/**
 * Shared edit form for /admin/colors/new and /admin/colors/[id]. Same
 * fields, same validation, same server actions as the old dialog —
 * just rendered as a page-embedded form now that the harmonized
 * list-row-to-detail-page pattern is in place.
 *
 * Create → on success, redirect back to /admin/colors so the new row
 * shows up in context. Edit → stay on the detail page and surface a
 * "Saved" indicator; admins frequently tweak a colour multiple times
 * (RAL code, then hex, then sort order) before moving on.
 */
export function ColorForm({ mode, initial, coatings }: Props) {
  const router = useRouter();
  const t = useTranslations("adminColors");
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: ColorFormValues = { ...EMPTY_COLOR_FORM, ...initial };
  const [values, setValues] = useState<ColorFormValues>(seed);

  // Keep an already-stored finish selectable even if it's since been archived,
  // so editing an old colour doesn't silently drop its coating.
  const coatingOptions =
    values.coating && !coatings.some((c) => c.slug === values.coating)
      ? [
          ...coatings,
          { slug: values.coating, label: coatingLabel(values.coating) ?? values.coating },
        ]
      : coatings;
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update<K extends keyof ColorFormValues>(
    key: K,
    value: ColorFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  // RAL is the source of truth for the colour: a recognised code syncs the hex
  // to the RAL's canonical colour so the swatch and the painter always agree.
  // An unknown/partial code leaves the hex untouched. The hex stays editable
  // for a deliberate custom shade — a mismatch then surfaces the "match RAL" fix.
  function onRalChange(raw: string) {
    setValues((prev) => {
      const hex = ralToHex(raw);
      return { ...prev, ral_code: raw, ...(hex ? { hex } : {}) };
    });
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "name_en", values.name_en.trim());
    appendField(fd, "name_da", values.name_da.trim());
    appendField(fd, "slug", values.slug.trim());
    appendField(fd, "hex", values.hex.trim());
    appendField(fd, "ral_code", values.ral_code.trim());
    appendField(fd, "coating", values.coating);
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
          ? await createColor(fd)
          : await updateColor(mode.id, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (mode.kind === "create") {
        router.push("/admin/colors");
        router.refresh();
      } else {
        setSavedAt(new Date().toISOString());
        router.refresh();
      }
    });
  }

  // Preview swatches: the entered hex and the RAL's canonical colour each get
  // one, so a divergence is visible at a glance. When both are set and disagree,
  // surface a one-click "match RAL" fix (RAL is the source of truth).
  const hexNorm = normHex(values.hex);
  const ralHex = ralToHex(values.ral_code);
  const ralConflict = Boolean(ralHex && hexNorm && ralHex.toLowerCase() !== hexNorm);

  // A complete-looking code (4+ digits) that we can't resolve isn't a RAL
  // Classic colour — warn so a typo like "2150" doesn't pass silently. Stays
  // quiet while the user is still typing (< 4 digits).
  const ralDigits = values.ral_code.replace(/[^0-9]/g, "");
  const ralUnknown =
    values.ral_code.trim() !== "" && ralHex == null && ralDigits.length >= 4;

  function matchRal() {
    if (ralHex) update("hex", ralHex);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("nameEnglish")} htmlFor="color-name-en">
          <Input
            id="color-name-en"
            value={values.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            placeholder={t("nameEnglishPlaceholder")}
            required
          />
        </Field>
        <Field label={t("nameDansk")} htmlFor="color-name-da">
          <Input
            id="color-name-da"
            value={values.name_da}
            onChange={(e) => update("name_da", e.target.value)}
            placeholder={t("nameDaPlaceholder")}
          />
        </Field>
      </div>

      <Field label={t("slug")} htmlFor="color-slug">
        <Input
          id="color-slug"
          value={values.slug}
          onChange={(e) => update("slug", e.target.value)}
          placeholder={t("slugPlaceholder")}
          className="font-mono"
        />
        <p className="text-muted-foreground text-xs">
          {t("slugHint")}
        </p>
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("ralCode")} htmlFor="color-ral">
          <div className="flex items-center gap-2">
            <Input
              id="color-ral"
              value={values.ral_code}
              onChange={(e) => onRalChange(e.target.value)}
              placeholder={t("ralPlaceholder")}
            />
            {ralHex ? (
              <ColorSwatch hex={ralHex} label={ralHex} />
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </div>
          {ralUnknown ? (
            <p className="text-xs text-money" role="alert">
              {t("ralUnknown", { code: values.ral_code.trim() })}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              {t("ralHint")}
            </p>
          )}
        </Field>
        <Field label={t("hexLabel")} htmlFor="color-hex">
          <div className="flex items-center gap-2">
            <Input
              id="color-hex"
              value={values.hex}
              onChange={(e) => update("hex", e.target.value)}
              placeholder="#1e4a7a"
              className="font-mono"
            />
            {hexNorm ? (
              <ColorSwatch hex={hexNorm} label={hexNorm} />
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {t("hexHint")}
          </p>
        </Field>
      </div>

      {ralConflict ? (
        <div className="bg-money-wash flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
          <span className="text-money">
            {t("ralConflict", { code: values.ral_code.trim(), hex: ralHex ?? "" })}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={matchRal}>
            {t("matchRal")}
          </Button>
        </div>
      ) : null}

      <Field label={t("coatingLabel")} htmlFor="color-coating">
        <select
          id="color-coating"
          value={values.coating}
          onChange={(e) => update("coating", e.target.value)}
          className="border-input bg-background h-9 max-w-[200px] rounded-md border px-2 text-sm"
        >
          <option value="">{t("coatingNone")}</option>
          {coatingOptions.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          {t("coatingHint")}
        </p>
      </Field>

      <Field label={t("sortOrder")} htmlFor="color-sort">
        <Input
          id="color-sort"
          type="number"
          inputMode="numeric"
          value={values.sort_order}
          onChange={(e) => update("sort_order", e.target.value)}
          className="max-w-[120px]"
        />
        <p className="text-muted-foreground text-xs">
          {t("sortHint")}
        </p>
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(e) => update("is_active", e.target.checked)}
          className="size-4"
        />
        {t("activeCheckbox")}
      </label>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <FormSaveBar
        pending={pending}
        cancelHref="/admin/colors"
        status={
          savedAt
            ? t("savedStatus", {
                time: new Date(savedAt).toLocaleTimeString("da-DK"),
              })
            : mode.kind === "create"
              ? t("notYetSaved")
              : t("upToDate")
        }
        submitLabel={
          mode.kind === "create"
            ? t("addColour")
            : t("submitEdit")
        }
      />
    </form>
  );
}

/**
 * Normalise a free-typed hex ("1e4a7a", "#1E4A7A") to lowercase `#rrggbb`, or
 * null when it isn't a complete 6-digit hex. Used for the preview swatch and
 * the RAL-divergence check.
 */
function normHex(s: string): string | null {
  const v = s.trim();
  if (!v) return null;
  const n = (v.startsWith("#") ? v : `#${v}`).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(n) ? n : null;
}

