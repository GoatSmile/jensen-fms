"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appendField } from "@/lib/forms";
import { KIT_STICKER_COLORS, kitCode } from "@/lib/kits/colors";

import { createKit, updateKit } from "../_actions/manage-kits";

export type KitFormValues = {
  sticker_color: string;
  kit_number: string;
  description: string;
};

export const EMPTY_KIT: KitFormValues = {
  sticker_color: "",
  kit_number: "",
  description: "",
};

type Props = {
  mode: "create" | "edit";
  kitId?: string;
  initial: KitFormValues;
};

export function KitForm({ mode, kitId, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<KitFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function update<K extends keyof KitFormValues>(
    key: K,
    value: KitFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = new FormData();
    appendField(fd, "sticker_color", values.sticker_color);
    appendField(fd, "kit_number", values.kit_number);
    appendField(fd, "description", values.description);
    start(async () => {
      const r =
        mode === "create" ? await createKit(fd) : await updateKit(kitId!, fd);
      if (!r.ok) {
        setError(r.error);
        setErrorField(r.field ?? null);
        return;
      }
      router.push(`/admin/kits/${r.id}`);
      router.refresh();
    });
  }

  // Live sticker-code preview: "Red" when the number is blank, "Red 1"
  // when a valid number is typed. Hidden while the number is invalid.
  const numberDraft = values.kit_number.trim();
  const previewNumber = numberDraft === "" ? null : Number(numberDraft);
  const preview =
    values.sticker_color &&
    (previewNumber === null ||
      (Number.isInteger(previewNumber) && previewNumber > 0))
      ? kitCode(values.sticker_color, previewNumber)
      : null;

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Sticker colour"
          htmlFor="kit-color"
          required
          error={errorField === "sticker_color" ? error : null}
        >
          <Select
            value={values.sticker_color}
            onValueChange={(v) => update("sticker_color", v)}
          >
            <SelectTrigger id="kit-color">
              <SelectValue placeholder="Pick a colour…" />
            </SelectTrigger>
            <SelectContent>
              {KIT_STICKER_COLORS.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block size-3 rounded-full border border-black/10"
                      style={{ backgroundColor: c.hex }}
                    />
                    {c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Number (optional)"
          htmlFor="kit-number"
          error={errorField === "kit_number" ? error : null}
        >
          <Input
            id="kit-number"
            inputMode="numeric"
            value={values.kit_number}
            onChange={(e) => update("kit_number", e.target.value)}
            placeholder="Blank = colour only"
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="kit-desc">
        <Input
          id="kit-desc"
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder='e.g. "Norma base kit" — optional'
        />
      </Field>

      {preview ? (
        <p className="text-muted-foreground text-sm">
          Sticker code: <span className="font-semibold">{preview}</span>
        </p>
      ) : null}

      {error && !errorField ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/kits")}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving…"
            : mode === "create"
              ? "Create kit"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
