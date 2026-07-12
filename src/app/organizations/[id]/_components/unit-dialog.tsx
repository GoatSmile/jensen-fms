"use client";

import { useEffect, useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { appendField } from "@/lib/forms";

import { createUnit, updateUnit } from "../_actions/manage-units";

export type UnitDialogValues = {
  name: string;
  code: string;
  address: string;
  notes: string;
};

export const EMPTY_UNIT: UnitDialogValues = {
  name: "",
  code: "",
  address: "",
  notes: "",
};

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: "create" | "edit";
  organizationId: string;
  unitId?: string;
  initial: UnitDialogValues;
};

export function UnitDialog({
  open,
  onOpenChange,
  mode,
  organizationId,
  unitId,
  initial,
}: Props) {
  const t = useTranslations("units");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [values, setValues] = useState<UnitDialogValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setValues(initial);
      setError(null);
      setErrorField(null);
    }
  }, [open, initial]);

  function update<K extends keyof UnitDialogValues>(
    key: K,
    value: UnitDialogValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "name", values.name);
    appendField(fd, "code", values.code);
    appendField(fd, "address", values.address);
    appendField(fd, "notes", values.notes);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = buildFormData();
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createUnit(organizationId, fd)
          : await updateUnit(unitId!, fd);
      if (!result.ok) {
        setError(result.error);
        setErrorField(result.field ?? null);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? t("addSubUnit") : t("editSubUnit")}
            </DialogTitle>
            <DialogDescription>{t("dialogDesc")}</DialogDescription>
          </DialogHeader>

          <Field
            label={t("fldName")}
            htmlFor="unit-name"
            required
            error={errorField === "name" ? error : null}
          >
            <Input
              id="unit-name"
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder={t("namePlaceholder")}
              required
              autoFocus
            />
          </Field>

          <Field label={t("fldCode")} htmlFor="unit-code">
            <Input
              id="unit-code"
              value={values.code}
              onChange={(e) => update("code", e.target.value)}
              placeholder={t("codePlaceholder")}
              className="font-mono"
            />
          </Field>

          <Field label={t("fldAddress")} htmlFor="unit-address">
            <Textarea
              id="unit-address"
              rows={2}
              value={values.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder={t("addressPlaceholder")}
            />
          </Field>

          <Field label={t("fldNotes")} htmlFor="unit-notes">
            <Textarea
              id="unit-notes"
              rows={2}
              value={values.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder={t("notesPlaceholder")}
            />
          </Field>

          {error && !errorField ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? tCommon("saving")
                : mode === "create"
                  ? t("addSubUnit")
                  : t("saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

