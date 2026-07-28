"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, List, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ColorSwatch } from "@/components/color-swatch";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { localizedName } from "@/i18n/vocab";
import { getVocab, type VocabDescriptor, type VocabId } from "@/lib/admin/vocabularies";
import { cn } from "@/lib/utils";

import {
  VocabRowEditor,
  type SelectOption,
  type VocabRowData,
} from "./vocab-row-editor";

/**
 * One vocabulary's rows, each expanding into the full editor.
 *
 * **Untinted `Panel`, deliberately.** Section tinting is for pages that stack
 * *different kinds* of section (CLAUDE.md) — `/admin/lists` shows one
 * homogeneous list at a time, so a wash here would spend colour on nothing. The
 * vocabulary's hue appears once, as the rail dot. Inside the panel the expanded
 * editor is `bg-ground`, which is correct because it IS in-panel.
 *
 * **The table gets no wrapper box** and the empty state is `bg-ground` rather
 * than a dashed border — both per the panel-table convention.
 */
export function VocabTable({
  vocabId,
  rows,
  parentOptions,
  coatingOptions,
}: {
  vocabId: VocabId;
  rows: VocabRowData[];
  parentOptions: SelectOption[];
  coatingOptions: SelectOption[];
}) {
  const vocab = getVocab(vocabId);
  const t = useTranslations("adminLists");
  const locale = useLocale();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const activeCount = rows.filter((row) => row.is_active !== false).length;
  // Title + descriptor columns + status + the chevron cell.
  const columnCount = vocab.columns.length + 3;

  return (
    <Panel
      title={t(vocab.labelKey)}
      description={t("countSummary", {
        active: activeCount,
        total: rows.length,
      })}
      action={
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setCreating((prev) => !prev);
            setOpenId(null);
          }}
        >
          <Plus aria-hidden /> {t("newEntry")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {creating ? (
          <VocabRowEditor
            vocabId={vocabId}
            row={null}
            parentOptions={parentOptions}
            coatingOptions={coatingOptions}
            onDone={() => setCreating(false)}
          />
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            inPanel
            icon={List}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("thName")}</TableHead>
                {vocab.columns.map((column) => (
                  <TableHead
                    key={column.name}
                    className={cn(
                      column.className,
                      column.align === "right" && "text-right",
                    )}
                  >
                    {t(column.labelKey)}
                  </TableHead>
                ))}
                <TableHead>{t("thStatus")}</TableHead>
                <TableHead className="w-[36px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isOpen = openId === row.id;
                const isActive = row.is_active !== false;
                return (
                  // Fragment carries the key: a bare <> in a map is the React
                  // list-key rule, and two of those reached main once already.
                  <Fragment key={row.id}>
                    <TableRow
                      onClick={() => {
                        setOpenId(isOpen ? null : row.id);
                        setCreating(false);
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {vocab.swatchField ? (
                            <ColorSwatch
                              hex={asText(row[vocab.swatchField])}
                              ralCode={asText(row.ral_code)}
                            />
                          ) : null}
                          {rowTitle(vocab, row, locale)}
                        </span>
                      </TableCell>
                      {vocab.columns.map((column) => (
                        <TableCell
                          key={column.name}
                          className={cn(
                            column.className,
                            column.align === "right" && "text-right",
                            "text-ink-2",
                          )}
                        >
                          {cellValue(
                            vocab,
                            column.name,
                            row,
                            parentOptions,
                            coatingOptions,
                          )}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Badge variant={isActive ? "secondary" : "outline"}>
                          {isActive ? t("statusActive") : t("statusArchived")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className="text-ink-2 flex justify-end"
                          aria-hidden
                        >
                          {isOpen ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow>
                        <TableCell colSpan={columnCount} className="p-2">
                          <VocabRowEditor
                            vocabId={vocabId}
                            row={row}
                            parentOptions={parentOptions}
                            coatingOptions={coatingOptions}
                            onDone={() => setOpenId(null)}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </Panel>
  );
}

function asText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function rowTitle(
  vocab: VocabDescriptor,
  row: VocabRowData,
  locale: string,
): string {
  const en = asText(row[vocab.title.en]) ?? "";
  if (!vocab.title.da) return en;
  return localizedName(locale, en, asText(row[vocab.title.da]));
}

/**
 * A collapsed cell. Reference columns resolve to their label and percentages
 * render as a percentage — a raw `0.048` or a bare uuid in the row would be
 * unreadable, and the row is what the admin scans.
 */
function cellValue(
  vocab: VocabDescriptor,
  name: string,
  row: VocabRowData,
  parentOptions: SelectOption[],
  coatingOptions: SelectOption[],
): string {
  const raw = row[name];
  if (raw == null || raw === "") return "—";
  const field = vocab.fields.find((candidate) => candidate.name === name);

  if (field?.type === "percent") {
    return `${Number((Number(raw) * 100).toFixed(6))} %`;
  }
  if (field?.type === "parent") {
    return (
      parentOptions.find((option) => option.value === String(raw))?.label ?? "—"
    );
  }
  if (field?.type === "coating") {
    return (
      coatingOptions.find((option) => option.value === String(raw))?.label ??
      String(raw)
    );
  }
  return String(raw);
}
