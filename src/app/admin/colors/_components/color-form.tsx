"use client";

import { useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
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

export const EMPTY_COLOR_FORM: ColorFormValues = {
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
  initial: ColorFormValues;
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
  const [values, setValues] = useState<ColorFormValues>(initial);

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

  // Picking a RAL code auto-fills the hex from the RAL Classic map — but only
  // when the hex is still blank, so a hand-entered hex is never clobbered. The
  // hex stays editable; this just gives the swatch a real colour for free.
  function onRalChange(raw: string) {
    setValues((prev) => {
      const next = { ...prev, ral_code: raw };
      if (!prev.hex.trim()) {
        const hex = ralToHex(raw);
        if (hex) next.hex = hex;
      }
      return next;
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

  // Derived: a small preview swatch next to the hex input so admins see
  // what they're picking before saving.
  const previewHex = (() => {
    const v = values.hex.trim();
    if (!v) return null;
    const normalised = v.startsWith("#") ? v : `#${v}`;
    return /^#[0-9a-fA-F]{6}$/.test(normalised) ? normalised : null;
  })();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name (English)" htmlFor="color-name-en">
          <Input
            id="color-name-en"
            value={values.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            placeholder="e.g. Petrol Blue"
            required
          />
        </Field>
        <Field label="Name (Dansk)" htmlFor="color-name-da">
          <Input
            id="color-name-da"
            value={values.name_da}
            onChange={(e) => update("name_da", e.target.value)}
            placeholder="(falls back to English if blank)"
          />
        </Field>
      </div>

      <Field label="Slug" htmlFor="color-slug">
        <Input
          id="color-slug"
          value={values.slug}
          onChange={(e) => update("slug", e.target.value)}
          placeholder="auto-derived from English name"
          className="font-mono"
        />
        <p className="text-muted-foreground text-xs">
          Stable identifier used in URLs / API. Leave blank to auto-derive.
        </p>
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Hex" htmlFor="color-hex">
          <div className="flex items-center gap-2">
            <Input
              id="color-hex"
              value={values.hex}
              onChange={(e) => update("hex", e.target.value)}
              placeholder="#1e4a7a"
              className="font-mono"
            />
            {previewHex ? (
              <ColorSwatch hex={previewHex} label={previewHex} />
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Optional. Used for the colour chip throughout the app.
          </p>
        </Field>
        <Field label="RAL code" htmlFor="color-ral">
          <Input
            id="color-ral"
            value={values.ral_code}
            onChange={(e) => onRalChange(e.target.value)}
            placeholder="e.g. RAL 5013"
          />
          <p className="text-muted-foreground text-xs">
            Optional. For the painter (Metacoat) to mix consistently. A known
            RAL auto-fills the hex (still editable).
          </p>
        </Field>
      </div>

      <Field label="Coating / finish" htmlFor="color-coating">
        <select
          id="color-coating"
          value={values.coating}
          onChange={(e) => update("coating", e.target.value)}
          className="border-input bg-background h-9 max-w-[200px] rounded-md border px-2 text-sm"
        >
          <option value="">— None / unspecified</option>
          {coatingOptions.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Optional. Make &ldquo;matte&rdquo; and &ldquo;glossy&rdquo; of the same
          RAL separate colours so the finish carries through to the build and
          paint order.
        </p>
      </Field>

      <Field label="Sort order" htmlFor="color-sort">
        <Input
          id="color-sort"
          type="number"
          inputMode="numeric"
          value={values.sort_order}
          onChange={(e) => update("sort_order", e.target.value)}
          className="max-w-[120px]"
        />
        <p className="text-muted-foreground text-xs">
          Lower numbers appear first in pickers.
        </p>
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.is_active}
          onChange={(e) => update("is_active", e.target.checked)}
          className="size-4"
        />
        Active (visible in colour pickers)
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
            <Link href="/admin/colors">Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : mode.kind === "create"
                ? "Add colour"
                : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

