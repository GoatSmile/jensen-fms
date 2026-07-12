"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
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
  TICKET_PRIORITIES,
  TICKET_SOURCES,
} from "@/lib/maintenance/ticket-status";

import { createTicket, updateTicket } from "../_actions/save-ticket";

const LANGUAGE_NONE = "__none__";
const CONTACT_NONE = "__none__";

export type BikeOption = {
  id: string;
  frame_number: string;
  template_label: string | null;
  bike_type_name: string | null;
  owner_organization_id: string | null;
  owner_name: string | null;
};

export type ContactOption = {
  id: string;
  full_name: string;
  organization_id: string;
  organization_name: string | null;
  role: string | null;
};

export type TicketFormValues = {
  bike_id: string;
  reported_by_contact_id: string; // "" or "__none__" = no contact
  reported_by_text: string;
  source: string;
  priority: string;
  description: string;
  reported_language: string; // "" / "__none__" / "da" / "en"
  notes: string;
};

export const EMPTY_TICKET_FORM: TicketFormValues = {
  bike_id: "",
  reported_by_contact_id: "",
  reported_by_text: "",
  source: "email",
  priority: "3",
  description: "",
  reported_language: LANGUAGE_NONE,
  notes: "",
};

type Mode = { kind: "create" } | { kind: "edit"; ticketId: string };

type Props = {
  initial: TicketFormValues;
  bikes: BikeOption[];
  contacts: ContactOption[];
  mode: Mode;
};

export function TicketForm({ initial, bikes, contacts, mode }: Props) {
  const t = useTranslations("tickets");
  const tCommon = useTranslations("common");
  const tSource = useTranslations("ticketSource");
  const tPriority = useTranslations("ticketPriority");
  const router = useRouter();
  const [values, setValues] = useState<TicketFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedBike = useMemo(
    () => bikes.find((b) => b.id === values.bike_id) ?? null,
    [bikes, values.bike_id],
  );

  const ownerOrgId = selectedBike?.owner_organization_id ?? null;
  const ownerContacts = useMemo(
    () => (ownerOrgId ? contacts.filter((c) => c.organization_id === ownerOrgId) : []),
    [contacts, ownerOrgId],
  );

  function update<K extends keyof TicketFormValues>(
    key: K,
    value: TicketFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  // When the bike changes, drop a contact that no longer belongs to the
  // new owner — keeps the dropdown coherent and avoids stale FKs.
  function onBikeChange(newBikeId: string) {
    const newBike = bikes.find((b) => b.id === newBikeId);
    setValues((prev) => {
      const next: TicketFormValues = { ...prev, bike_id: newBikeId };
      const newOrgId = newBike?.owner_organization_id ?? null;
      if (prev.reported_by_contact_id && prev.reported_by_contact_id !== CONTACT_NONE) {
        const c = contacts.find((x) => x.id === prev.reported_by_contact_id);
        if (!c || c.organization_id !== newOrgId) {
          next.reported_by_contact_id = "";
        }
      }
      return next;
    });
    if (errorField === "bike_id") {
      setError(null);
      setErrorField(null);
    }
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    appendField(fd, "bike_id", values.bike_id);
    const contactValue =
      values.reported_by_contact_id === CONTACT_NONE
        ? ""
        : values.reported_by_contact_id;
    appendField(fd, "reported_by_contact_id", contactValue);
    appendField(fd, "reported_by_text", values.reported_by_text);
    appendField(fd, "source", values.source);
    appendField(fd, "priority", values.priority);
    appendField(fd, "description", values.description);
    const languageValue =
      values.reported_language === LANGUAGE_NONE ? "" : values.reported_language;
    appendField(fd, "reported_language", languageValue);
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
        mode.kind === "create"
          ? await createTicket(fd)
          : await updateTicket(mode.ticketId, fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    if (mode.kind === "edit") {
      router.push(`/maintenance/tickets/${mode.ticketId}`);
    } else {
      router.push("/maintenance/tickets");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title={t("formBikeReporter")}
        description={t("formBikeReporterDesc")}
      >
        <Field
          label={t("bike")}
          htmlFor="ticket-bike"
          required
          error={errorField === "bike_id" ? error : null}
        >
          <Select value={values.bike_id} onValueChange={onBikeChange}>
            <SelectTrigger id="ticket-bike">
              <SelectValue placeholder={t("pickBike")} />
            </SelectTrigger>
            <SelectContent>
              {bikes.length === 0 ? (
                <div className="text-muted-foreground p-2 text-xs">
                  {t("noBikes")}
                </div>
              ) : (
                bikes.map((b) => {
                  const parts = [
                    b.template_label ?? b.bike_type_name ?? "—",
                  ].filter(Boolean);
                  const tail = b.owner_name ? ` · ${b.owner_name}` : "";
                  return (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="font-mono text-xs">{b.frame_number}</span>
                      <span className="ml-2 text-xs">
                        {parts.join(" · ")}
                        {tail}
                      </span>
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>
        </Field>

        {selectedBike?.owner_organization_id ? (
          <Field label={t("contactRoster")} htmlFor="ticket-contact">
            <Select
              value={values.reported_by_contact_id || CONTACT_NONE}
              onValueChange={(v) => update("reported_by_contact_id", v)}
            >
              <SelectTrigger id="ticket-contact">
                <SelectValue placeholder={t("pickContact")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CONTACT_NONE}>
                  {t("noContactOption")}
                </SelectItem>
                {ownerContacts.length === 0 ? (
                  <div className="text-muted-foreground p-2 text-xs">
                    {t("noContacts")}
                  </div>
                ) : (
                  ownerContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                      {c.role ? (
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          · {c.role}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field
          label={t("orEnterReporter")}
          htmlFor="ticket-reporter-text"
          error={errorField === "reported_by_text" ? error : null}
        >
          <Input
            id="ticket-reporter-text"
            value={values.reported_by_text}
            onChange={(e) => update("reported_by_text", e.target.value)}
            placeholder={t("reporterPlaceholder")}
          />
          <p className="text-muted-foreground text-xs">{t("reporterHint")}</p>
        </Field>
      </FormSection>

      <FormSection
        title={t("formDescriptionTitle")}
        description={t("formDescriptionDesc")}
      >
        <Field
          label={t("description")}
          htmlFor="ticket-description"
          required
          error={errorField === "description" ? error : null}
        >
          <Textarea
            id="ticket-description"
            rows={4}
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            required
          />
        </Field>
        <Field
          label={t("reportedLanguage")}
          htmlFor="ticket-language"
          error={errorField === "reported_language" ? error : null}
        >
          <Select
            value={values.reported_language || LANGUAGE_NONE}
            onValueChange={(v) => update("reported_language", v)}
          >
            <SelectTrigger id="ticket-language">
              <SelectValue placeholder={t("unspecified")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LANGUAGE_NONE}>{t("unspecified")}</SelectItem>
              <SelectItem value="da">Dansk</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title={t("formClassificationTitle")}
        description={t("formClassificationDesc")}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("source")}
            htmlFor="ticket-source"
            required
            error={errorField === "source" ? error : null}
          >
            <Select
              value={values.source}
              onValueChange={(v) => update("source", v)}
            >
              <SelectTrigger id="ticket-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tSource(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label={t("priority")}
            htmlFor="ticket-priority"
            required
            error={errorField === "priority" ? error : null}
          >
            <Select
              value={values.priority}
              onValueChange={(v) => update("priority", v)}
            >
              <SelectTrigger id="ticket-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    {p} — {tPriority(String(p))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection
        title={t("formNotesTitle")}
        description={t("formNotesDesc")}
      >
        <Field label={t("notes")} htmlFor="ticket-notes">
          <Textarea
            id="ticket-notes"
            rows={3}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder={t("notesPlaceholder")}
          />
        </Field>
      </FormSection>

      {error && !errorField ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? mode.kind === "edit"
              ? tCommon("saving")
              : t("creating")
            : mode.kind === "edit"
              ? t("saveChanges")
              : t("createTicket")}
        </Button>
      </div>
    </form>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border">
      <header className="flex flex-col gap-0.5 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </header>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

