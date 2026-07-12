"use client";

import { useMemo, useState, useTransition } from "react";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appendField } from "@/lib/forms";

import { createWorkOrder } from "../_actions/save-wo";

const TICKET_NONE = "__none__";

export type BikeOption = {
  id: string;
  frame_number: string;
  template_label: string | null;
  bike_type_name: string | null;
  owner_organization_id: string | null;
  owner_name: string | null;
};

export type TicketOption = {
  id: string;
  ticket_number: string;
  status: string;
  description: string;
  bike_id: string;
};

export type WOFormValues = {
  bike_id: string;
  ticket_id: string; // "" or "__none__" = no ticket
  language: string; // "da" | "en"
  diagnosis: string;
  work_performed: string;
};

export const EMPTY_WO_FORM: WOFormValues = {
  bike_id: "",
  ticket_id: TICKET_NONE,
  language: "da",
  diagnosis: "",
  work_performed: "",
};

type Props = {
  initial: WOFormValues;
  bikes: BikeOption[];
  tickets: TicketOption[];
};

function summarise(text: string, max = 50): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export function WOForm({ initial, bikes, tickets }: Props) {
  const t = useTranslations("workOrders");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [values, setValues] = useState<WOFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ticketsForBike = useMemo(
    () => (values.bike_id ? tickets.filter((t) => t.bike_id === values.bike_id) : []),
    [tickets, values.bike_id],
  );

  function update<K extends keyof WOFormValues>(
    key: K,
    value: WOFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function onBikeChange(newBikeId: string) {
    setValues((prev) => {
      const next: WOFormValues = { ...prev, bike_id: newBikeId };
      // If the previously-selected ticket doesn't belong to the new bike,
      // drop it back to none so we don't post a stale ticket_id.
      if (prev.ticket_id && prev.ticket_id !== TICKET_NONE) {
        const t = tickets.find((x) => x.id === prev.ticket_id);
        if (!t || t.bike_id !== newBikeId) {
          next.ticket_id = TICKET_NONE;
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
    const ticketValue =
      values.ticket_id === TICKET_NONE ? "" : values.ticket_id;
    appendField(fd, "ticket_id", ticketValue);
    appendField(fd, "language", values.language);
    appendField(fd, "diagnosis", values.diagnosis);
    appendField(fd, "work_performed", values.work_performed);
    return fd;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    const fd = buildFormData();
    startTransition(async () => {
      const result = await createWorkOrder(fd);
      if (!result || result.ok) return;
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  function onCancel() {
    router.push("/maintenance/work-orders");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FormSection
        title={t("formBikeTicket")}
        description={t("formBikeTicketDesc")}
      >
        <Field
          label={t("bike")}
          htmlFor="wo-bike"
          required
          error={errorField === "bike_id" ? error : null}
        >
          <Select value={values.bike_id} onValueChange={onBikeChange}>
            <SelectTrigger id="wo-bike">
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

        {values.bike_id ? (
          <Field label={t("relatedTicket")} htmlFor="wo-ticket">
            <Select
              value={values.ticket_id || TICKET_NONE}
              onValueChange={(v) => update("ticket_id", v)}
            >
              <SelectTrigger id="wo-ticket">
                <SelectValue placeholder={t("noTicketPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TICKET_NONE}>
                  {t("noTicketOption")}
                </SelectItem>
                {ticketsForBike.length === 0 ? (
                  <div className="text-muted-foreground p-2 text-xs">
                    {t("noTickets")}
                  </div>
                ) : (
                  ticketsForBike.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-mono text-xs">
                        {t.ticket_number}
                      </span>
                      <span className="ml-2 text-xs">
                        {summarise(t.description)}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t("relatedTicketHint")}
            </p>
          </Field>
        ) : null}
      </FormSection>

      <FormSection
        title={t("formNotesTitle")}
        description={t("formNotesDesc")}
      >
        <Field
          label={t("diagnosis")}
          htmlFor="wo-diagnosis"
          error={errorField === "diagnosis" ? error : null}
        >
          <Textarea
            id="wo-diagnosis"
            rows={3}
            value={values.diagnosis}
            onChange={(e) => update("diagnosis", e.target.value)}
            placeholder={t("formDiagnosisPlaceholder")}
          />
        </Field>
        <Field
          label={t("workPerformed")}
          htmlFor="wo-work-performed"
          error={errorField === "work_performed" ? error : null}
        >
          <Textarea
            id="wo-work-performed"
            rows={3}
            value={values.work_performed}
            onChange={(e) => update("work_performed", e.target.value)}
            placeholder={t("formWorkPerformedPlaceholder")}
          />
        </Field>
        <Field
          label={t("language")}
          htmlFor="wo-language"
          error={errorField === "language" ? error : null}
        >
          <Select
            value={values.language}
            onValueChange={(v) => update("language", v)}
          >
            <SelectTrigger id="wo-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="da">Dansk</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {t("languageHint")}
          </p>
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
          {isPending ? t("creating") : t("createWorkOrder")}
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

