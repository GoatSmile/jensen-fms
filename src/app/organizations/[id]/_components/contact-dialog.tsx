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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appendField } from "@/lib/forms";

import {
  createContact,
  updateContact,
} from "../_actions/manage-contacts";

export type ContactDialogValues = {
  first_name: string;
  last_name: string;
  role: string;
  email: string;
  phone: string;
  preferred_language: string;
  is_primary: boolean;
  notes: string;
};

export const EMPTY_CONTACT: ContactDialogValues = {
  first_name: "",
  last_name: "",
  role: "",
  email: "",
  phone: "",
  preferred_language: "da",
  is_primary: false,
  notes: "",
};

// Radix Select can't be controlled by an empty string — use a sentinel for
// "no preferred language" so it renders the placeholder slot cleanly.
const NO_LANG = "__none__";

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: "create" | "edit";
  organizationId: string;
  contactId?: string;
  initial: ContactDialogValues;
};

export function ContactDialog({
  open,
  onOpenChange,
  mode,
  organizationId,
  contactId,
  initial,
}: Props) {
  const t = useTranslations("contacts");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("lang");
  const router = useRouter();
  const [values, setValues] = useState<ContactDialogValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset form whenever the dialog opens (with the latest initial values)
  // or closes (so stale state from a previous edit doesn't bleed in).
  useEffect(() => {
    if (open) {
      setValues(initial);
      setError(null);
      setErrorField(null);
    }
  }, [open, initial]);

  function update<K extends keyof ContactDialogValues>(
    key: K,
    value: ContactDialogValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "first_name", values.first_name);
    appendField(fd, "last_name", values.last_name);
    appendField(fd, "role", values.role);
    appendField(fd, "email", values.email);
    appendField(fd, "phone", values.phone);
    appendField(
      fd,
      "preferred_language",
      values.preferred_language === NO_LANG ? "" : values.preferred_language,
    );
    appendField(fd, "is_primary", values.is_primary ? "true" : "");
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
          ? await createContact(organizationId, fd)
          : await updateContact(contactId!, fd);
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
              {mode === "create" ? t("addContact") : t("editContact")}
            </DialogTitle>
            <DialogDescription>{t("dialogDesc")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={t("fldFirst")}
              htmlFor="contact-first"
              error={errorField === "first_name" ? error : null}
            >
              <Input
                id="contact-first"
                value={values.first_name}
                onChange={(e) => update("first_name", e.target.value)}
                autoFocus
              />
            </Field>
            <Field label={t("fldLast")} htmlFor="contact-last">
              <Input
                id="contact-last"
                value={values.last_name}
                onChange={(e) => update("last_name", e.target.value)}
              />
            </Field>
          </div>

          <Field label={t("fldRole")} htmlFor="contact-role">
            <Input
              id="contact-role"
              value={values.role}
              onChange={(e) => update("role", e.target.value)}
              placeholder={t("rolePlaceholder")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("fldEmail")} htmlFor="contact-email">
              <Input
                id="contact-email"
                type="email"
                value={values.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder={t("emailPlaceholder")}
                className="font-mono"
              />
            </Field>
            <Field label={t("fldPhone")} htmlFor="contact-phone">
              <Input
                id="contact-phone"
                type="tel"
                value={values.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder={t("phonePlaceholder")}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("fldLanguage")} htmlFor="contact-lang">
              <Select
                value={
                  values.preferred_language === ""
                    ? NO_LANG
                    : values.preferred_language
                }
                onValueChange={(v) => update("preferred_language", v)}
              >
                <SelectTrigger id="contact-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LANG}>{t("langUnspecified")}</SelectItem>
                  <SelectItem value="da">{tLang("da")}</SelectItem>
                  <SelectItem value="en">{tLang("en")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="border-input size-4 rounded border"
                  checked={values.is_primary}
                  onChange={(e) => update("is_primary", e.target.checked)}
                />
                {t("primaryContact")}
              </label>
            </div>
          </div>

          <Field label={t("fldNotes")} htmlFor="contact-notes">
            <Textarea
              id="contact-notes"
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
                  ? t("addContact")
                  : t("saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

