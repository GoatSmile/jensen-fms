"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const EMPTY_SEGMENT_FORM: SegmentFormValues = {
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
  initial: SegmentFormValues;
};

export function SegmentForm({ mode, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<SegmentFormValues>(initial);
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
        <Field label="Name (English)" htmlFor="seg-name-en">
          <Input
            id="seg-name-en"
            value={values.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            placeholder="e.g. Hotel"
            required
          />
        </Field>
        <Field label="Name (Dansk)" htmlFor="seg-name-da">
          <Input
            id="seg-name-da"
            value={values.name_da}
            onChange={(e) => update("name_da", e.target.value)}
            placeholder="e.g. Hotel"
          />
        </Field>
      </div>

      <Field label="Slug" htmlFor="seg-slug">
        <Input
          id="seg-slug"
          value={values.slug}
          onChange={(e) => update("slug", e.target.value)}
          placeholder="auto-derived from English name (uses underscores)"
          className="font-mono"
        />
        <p className="text-muted-foreground text-xs">
          Stable identifier. Leave blank to auto-derive.
        </p>
      </Field>

      <Field label="Description (English)" htmlFor="seg-desc-en">
        <Textarea
          id="seg-desc-en"
          rows={2}
          value={values.description_en}
          onChange={(e) => update("description_en", e.target.value)}
          placeholder="Optional. Shown as helper text in pickers."
        />
      </Field>

      <Field label="Description (Dansk)" htmlFor="seg-desc-da">
        <Textarea
          id="seg-desc-da"
          rows={2}
          value={values.description_da}
          onChange={(e) => update("description_da", e.target.value)}
          placeholder="Optional Danish translation."
        />
      </Field>

      <Field label="Sort order" htmlFor="seg-sort">
        <Input
          id="seg-sort"
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
        Active (visible in segment pickers)
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
            <Link href="/admin/customer-segments">Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : mode.kind === "create"
                ? "Add segment"
                : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
