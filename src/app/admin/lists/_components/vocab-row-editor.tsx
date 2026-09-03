"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { ArchivePanel } from "@/components/archive-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getVocab,
  type VocabDescriptor,
  type VocabField,
} from "@/lib/admin/vocabularies";

import { saveVocabRow, setVocabRowActive } from "../_actions/dispatch";

export type VocabRowData = Record<string, unknown> & { id: string };

export type SelectOption = { value: string; label: string };

/**
 * The editor a row expands into — every field the retired `[id]` detail page
 * carried, plus its archive control.
 *
 * **Fields are controlled state and FormData is built by hand**, rather than
 * letting a native `<form>` collect it. Two reasons, both concrete:
 * percentages need a transform (see below), and an expanded row has the same
 * problem CLAUDE.md records for a folded `FormSection` — inputs that are not
 * mounted cannot be validated by the browser, so validation has to be the
 * server's job regardless. It already is: every rule lives in the vocabulary's
 * own action and comes back as a localized `error` string, which is what this
 * renders.
 *
 * **Percentages are stored as a FRACTION and shown as a percent.** `hs_codes`
 * keeps `tariff_pct = 0.048` for 4.8 %, and its action validates the range
 * 0..1 — the old form divided by 100 on the way in, so this does too. Posting
 * the percent unconverted would not corrupt anything (the range check rejects
 * anything over 1), but it would read as a mysterious validation error.
 */
export function VocabRowEditor({
  vocabId,
  row,
  parentOptions,
  coatingOptions,
  categoryOptions,
  onDone,
  keepOpenOnSave = false,
  usageCount = 0,
  extraControls,
}: {
  vocabId: VocabDescriptor["id"];
  /** `null` for the create row. */
  row: VocabRowData | null;
  parentOptions: SelectOption[];
  coatingOptions: SelectOption[];
  categoryOptions: SelectOption[];
  onDone: () => void;
  /** How many records reference this row, for the archive warning. */
  usageCount?: number;
  /**
   * Row-level controls that are not vocabulary fields — locations' "Make
   * primary". A slot rather than a vocab branch here, so the editor stays
   * descriptor-driven.
   */
  extraControls?: React.ReactNode;
  /**
   * Keep the row OPEN after a successful save instead of collapsing it. Set for
   * the vocabulary whose row carries an action that only becomes available once
   * the value is stored (service part types: the apply button keys off the
   * SAVED category, so collapsing on save hid the very control the save
   * enabled).
   */
  keepOpenOnSave?: boolean;
}) {
  const vocab = getVocab(vocabId);
  const t = useTranslations("adminLists");
  const tCommon = useTranslations("common");
  const [values, setValues] = useState<Record<string, string>>(() =>
    seedValues(vocab, row),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const isActive = row ? row.is_active !== false : true;

  function update(name: string, value: string) {
    setSaved(false);
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    for (const field of vocab.fields) {
      formData.set(field.name, postValue(field, values[field.name] ?? ""));
    }
    // `is_active: formData.get("is_active") === "on"` in six of the seven
    // actions means an ABSENT field reads as FALSE — so saving a rename without
    // this line would silently archive the row. Coatings leaves is_active out of
    // its parse entirely, hence the descriptor flag rather than always sending.
    if (vocab.isActiveInFormData && isActive) formData.set("is_active", "on");

    start(async () => {
      const result = await saveVocabRow(vocabId, row?.id ?? null, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Staying open needs its own acknowledgement: without the collapse, a
      // successful save would look like nothing happened. The action
      // revalidates, so the `row` prop arrives updated and any control keyed
      // off the stored value appears in place.
      if (keepOpenOnSave && row) setSaved(true);
      else onDone();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-ground flex flex-col gap-4 rounded-lg p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {vocab.fields.map((field) => {
          const inputId = `${vocabId}-${row?.id ?? "new"}-${field.name}`;
          return (
            <div
              key={field.name}
              className={field.wide ? "sm:col-span-2" : undefined}
            >
              {/* `Label` is `flex items-center gap-2`, so a second child becomes
                  a flex ITEM beside the text — an asterisk as its own child
                  wrapped onto its own line (CLAUDE.md's Label gotcha). One span
                  keeps the marker inline with the label. */}
              <Label htmlFor={inputId} className="pb-1.5">
                <span>
                  {t(field.labelKey)}
                  {field.required ? (
                    <span className="text-alert" aria-hidden>
                      {" *"}
                    </span>
                  ) : null}
                </span>
              </Label>
              <FieldInput
                id={inputId}
                field={field}
                value={values[field.name] ?? ""}
                onChange={(next) => update(field.name, next)}
                parentOptions={parentOptions.filter(
                  // A category cannot be its own parent. Descendants are caught
                  // server-side by `wouldCycle` — the full tree isn't known here.
                  (option) => option.value !== row?.id,
                )}
                coatingOptions={coatingOptions}
                categoryOptions={categoryOptions}
              />
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {saved ? (
          <span className="text-good mr-auto text-xs" role="status">
            {tCommon("saved")}
          </span>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDone}
          disabled={pending}
        >
          {saved ? tCommon("close") : tCommon("cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? tCommon("saving") : t(row ? "saveRow" : "createRow")}
        </Button>
      </div>

      {row ? (
        <>
          <hr className="border-rule" />
          {extraControls ? (
            <div className="flex justify-end">{extraControls}</div>
          ) : null}
          {/* Inline variant: a Panel here would be a box inside a table cell
              inside a Panel — the card soup the panel convention replaced. */}
          <ArchivePanel
            variant="inline"
            namespace={vocab.archiveNamespace}
            isActive={isActive}
            description={
              // The retired detail pages made this concrete with a count. A
              // generic "N records use this" sentence appended to the entity
              // copy beats seven more per-entity message keys.
              usageCount > 0
                ? `${t(vocab.archiveCopyKey)} ${t("archiveInUse", { count: usageCount })}`
                : t(vocab.archiveCopyKey)
            }
            onToggle={async () => {
              const result = await setVocabRowActive(
                vocabId,
                row.id,
                !isActive,
              );
              if (result.ok) {
                onDone();
                return null;
              }
              return result.error;
            }}
          />
        </>
      ) : null}
    </form>
  );
}

function FieldInput({
  id,
  field,
  value,
  onChange,
  parentOptions,
  coatingOptions,
  categoryOptions,
}: {
  id: string;
  field: VocabField;
  value: string;
  onChange: (next: string) => void;
  parentOptions: SelectOption[];
  coatingOptions: SelectOption[];
  categoryOptions: SelectOption[];
}) {
  if (field.type === "textarea") {
    return (
      <Textarea
        id={id}
        value={value}
        rows={2}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (
    field.type === "parent" ||
    field.type === "coating" ||
    field.type === "partCategory"
  ) {
    const options =
      field.type === "parent"
        ? parentOptions
        : field.type === "coating"
          ? coatingOptions
          : categoryOptions;
    return (
      // Native select styled to match `Input` — the established pattern in these
      // admin forms, and its border belongs to the control (not card soup).
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      id={id}
      value={value}
      inputMode={
        field.type === "number" || field.type === "percent"
          ? "decimal"
          : undefined
      }
      placeholder={field.type === "hex" ? "#000000" : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** DB row → editor strings. */
function seedValues(
  vocab: VocabDescriptor,
  row: VocabRowData | null,
): Record<string, string> {
  const seed: Record<string, string> = {};
  for (const field of vocab.fields) {
    const raw = row?.[field.name];
    if (raw == null) {
      seed[field.name] = "";
      continue;
    }
    if (field.type === "percent") {
      // 0.048 → "4.8". toFixed trims the float noise 0.048 * 100 produces.
      seed[field.name] = String(Number((Number(raw) * 100).toFixed(6)));
      continue;
    }
    seed[field.name] = String(raw);
  }
  return seed;
}

/** Editor string → the value the action's `parseFormData` expects. */
function postValue(field: VocabField, value: string): string {
  const trimmed = value.trim();
  if (field.type !== "percent" || trimmed === "") return trimmed;
  const asNumber = Number(trimmed.replace(",", "."));
  // Non-numeric passes straight through so the action owns the error message.
  if (!Number.isFinite(asNumber)) return trimmed;
  return String(Number((asNumber / 100).toFixed(8)));
}
