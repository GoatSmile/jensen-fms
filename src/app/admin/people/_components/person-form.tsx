"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Field } from "@/components/field";
import { FormSaveBar } from "@/components/form-save-bar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appendField } from "@/lib/forms";

import { createPerson, updatePerson } from "../_actions/manage-people";

export type PersonFormValues = {
  full_name: string;
  email: string;
  phone: string;
  preferred_language: "da" | "en";
  engagement: "owner" | "employee" | "temp" | "contractor";
  engaged_from: string;
  engaged_until: string;
  notify_email: boolean;
  notify_sms: boolean;
  notes: string;
  is_active: boolean;
  role_ids: string[];
};

const EMPTY_PERSON_FORM: PersonFormValues = {
  full_name: "",
  email: "",
  phone: "",
  preferred_language: "da",
  engagement: "employee",
  engaged_from: "",
  engaged_until: "",
  notify_email: true,
  notify_sms: false,
  notes: "",
  is_active: true,
  role_ids: [],
};

const ENGAGEMENTS = ["owner", "employee", "temp", "contractor"] as const;

type Mode = { kind: "create" } | { kind: "edit"; id: string };

/**
 * Shared form for /admin/people/new and /admin/people/[id]. Role labels
 * are localized by the server parent (parent-remap pattern) so this
 * component stays vocabulary-blind.
 */
export function PersonForm({
  mode,
  initial,
  roleOptions,
}: {
  mode: Mode;
  /** Overrides only — unset fields fall back to EMPTY_PERSON_FORM. */
  initial?: Partial<PersonFormValues>;
  roleOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const t = useTranslations("adminPeople");
  const tLang = useTranslations("lang");
  // Defaults are merged HERE, not in the server page: this module is
  // `"use client"`, so its exports are client references on the server and
  // a page that spread the shell got `{}` (see CLAUDE.md).
  const seed: PersonFormValues = { ...EMPTY_PERSON_FORM, ...initial };
  const [values, setValues] = useState<PersonFormValues>(seed);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update<K extends keyof PersonFormValues>(
    key: K,
    value: PersonFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRole(roleId: string, checked: boolean) {
    setValues((prev) => ({
      ...prev,
      role_ids: checked
        ? [...prev.role_ids, roleId]
        : prev.role_ids.filter((id) => id !== roleId),
    }));
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "full_name", values.full_name.trim());
    appendField(fd, "email", values.email.trim());
    appendField(fd, "phone", values.phone.trim());
    appendField(fd, "preferred_language", values.preferred_language);
    appendField(fd, "engagement", values.engagement);
    appendField(fd, "engaged_from", values.engaged_from);
    appendField(fd, "engaged_until", values.engaged_until);
    if (values.notify_email) fd.set("notify_email", "on");
    if (values.notify_sms) fd.set("notify_sms", "on");
    appendField(fd, "notes", values.notes.trim());
    if (values.is_active) fd.set("is_active", "on");
    for (const id of values.role_ids) fd.append("role_ids", id);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = buildFormData();
    start(async () => {
      const r =
        mode.kind === "create"
          ? await createPerson(fd)
          : await updatePerson(mode.id, fd);
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
      <Field label={t("fieldFullName")} htmlFor="person-name">
        <Input
          id="person-name"
          value={values.full_name}
          onChange={(e) => update("full_name", e.target.value)}
          placeholder={t("fullNamePlaceholder")}
          required
          autoFocus
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("fieldEmail")} htmlFor="person-email">
          <Input
            id="person-email"
            type="email"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </Field>
        <Field label={t("fieldPhone")} htmlFor="person-phone">
          <Input
            id="person-phone"
            type="tel"
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("fieldEngagement")} htmlFor="person-engagement">
          <Select
            value={values.engagement}
            onValueChange={(v) =>
              update("engagement", v as PersonFormValues["engagement"])
            }
          >
            <SelectTrigger id="person-engagement">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENGAGEMENTS.map((e) => (
                <SelectItem key={e} value={e}>
                  {t(`engagement_${e}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("fieldLanguage")} htmlFor="person-language">
          <Select
            value={values.preferred_language}
            onValueChange={(v) =>
              update("preferred_language", v === "en" ? "en" : "da")
            }
          >
            <SelectTrigger id="person-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="da">{tLang("da")}</SelectItem>
              <SelectItem value="en">{tLang("en")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("fieldEngagedFrom")} htmlFor="person-from">
          <Input
            id="person-from"
            type="date"
            value={values.engaged_from}
            onChange={(e) => update("engaged_from", e.target.value)}
          />
        </Field>
        <Field label={t("fieldEngagedUntil")} htmlFor="person-until">
          <Input
            id="person-until"
            type="date"
            value={values.engaged_until}
            onChange={(e) => update("engaged_until", e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {t("engagedUntilHint")}
          </p>
        </Field>
      </div>

      {/* fieldset/legend kept for the grouping semantics; see role-form. */}
      <fieldset className="bg-surface flex flex-col gap-2 rounded-lg p-4">
        <legend className="text-ink-2 text-xs font-bold tracking-[0.075em] uppercase">
          {t("rolesLegend")}
        </legend>
        {roleOptions.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            {t("noRolesYet")}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {roleOptions.map((role) => (
              <label
                key={role.id}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={values.role_ids.includes(role.id)}
                  onChange={(e) => toggleRole(role.id, e.target.checked)}
                  className="size-4"
                />
                {role.label}
              </label>
            ))}
          </div>
        )}
        <p className="text-muted-foreground text-xs">{t("rolesHint")}</p>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.notify_email}
            onChange={(e) => update("notify_email", e.target.checked)}
            className="size-4"
          />
          {t("notifyEmailLabel")}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.notify_sms}
            onChange={(e) => update("notify_sms", e.target.checked)}
            className="size-4"
          />
          {t("notifySmsLabel")}
        </label>
      </div>

      <Field label={t("fieldNotes")} htmlFor="person-notes">
        <Textarea
          id="person-notes"
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={3}
        />
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

      <FormSaveBar
        pending={pending}
        cancelHref="/admin/people"
        status={
          savedAt
            ? t("savedAt", {
                time: new Date(savedAt).toLocaleTimeString("da-DK"),
              })
            : mode.kind === "create"
              ? t("notYetSaved")
              : t("upToDate")
        }
        submitLabel={
          mode.kind === "create"
            ? t("addPerson")
            : t("saveChanges")
        }
      />
    </form>
  );
}
