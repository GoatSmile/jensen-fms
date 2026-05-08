"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitBranch, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { cloneAsNewVersion } from "../_actions/clone-as-version";
import { saveTemplateParts } from "../_actions/save-parts";
import {
  PartPickerDialog,
  type PartOption,
} from "./part-picker-dialog";

export type RecipeRow = {
  partId: string;
  partSku: string;
  partName: string;
  quantity: string;
  isOptional: boolean;
  notes: string;
};

type Props = {
  templateId: string;
  isCurrent: boolean;
  initialRows: RecipeRow[];
  parts: PartOption[];
};

export function PartsRecipeSection({
  templateId,
  isCurrent,
  initialRows,
  parts,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<RecipeRow[]>(initialRows);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Has the user changed anything since the page loaded?
  const dirty = useMemo(() => {
    if (rows.length !== initialRows.length) return true;
    for (let i = 0; i < rows.length; i++) {
      const a = rows[i];
      const b = initialRows[i];
      if (
        a.partId !== b.partId ||
        a.quantity !== b.quantity ||
        a.isOptional !== b.isOptional ||
        a.notes !== b.notes
      ) {
        return true;
      }
    }
    return false;
  }, [rows, initialRows]);

  const partsById = useMemo(() => {
    const m = new Map<string, PartOption>();
    for (const p of parts) m.set(p.id, p);
    return m;
  }, [parts]);

  const excludeIds = useMemo(
    () => new Set(rows.map((r) => r.partId)),
    [rows],
  );

  const totalUnitsPerBike = useMemo(
    () =>
      rows.reduce((sum, r) => {
        const n = Number(r.quantity);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [rows],
  );

  function addPart(partId: string) {
    const part = partsById.get(partId);
    if (!part) return;
    setRows((prev) => [
      ...prev,
      {
        partId: part.id,
        partSku: part.internal_sku,
        partName: part.name_en,
        quantity: "1",
        isOptional: false,
        notes: "",
      },
    ]);
    setSuccess(null);
  }

  function updateRow(idx: number, patch: Partial<RecipeRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
    setSuccess(null);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setSuccess(null);
  }

  function buildPartsPayload(): Array<{
    partId: string;
    quantity: number;
    isOptional: boolean;
    notes: string | null;
  }> {
    return rows.map((r) => ({
      partId: r.partId,
      quantity: Number(r.quantity),
      isOptional: r.isOptional,
      notes: r.notes.trim() === "" ? null : r.notes.trim(),
    }));
  }

  function onSave() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await saveTemplateParts({
        templateId,
        parts: buildPartsPayload(),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess("Recipe saved.");
      router.refresh();
    });
  }

  function onSaveAsVersion() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await cloneAsNewVersion(templateId, buildPartsPayload());
      if (!r || (r as { ok: boolean }).ok) return;
      const err = r as { ok: false; error: string };
      setError(err.error);
    });
  }

  const canEdit = isCurrent;

  return (
    <section className="rounded-md border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Parts recipe</h2>
          <p className="text-muted-foreground text-xs">
            {rows.length} part{rows.length === 1 ? "" : "s"} · {totalUnitsPerBike} unit{totalUnitsPerBike === 1 ? "" : "s"} per bike
          </p>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickerOpen(true)}
              disabled={isPending}
            >
              <Plus aria-hidden /> Add part
            </Button>
          </div>
        ) : null}
      </header>

      <div className="p-4">
        {!canEdit ? (
          <p className="bg-muted text-muted-foreground mb-3 rounded-md border px-3 py-2 text-xs">
            This is a past version. The current version is editable; open it to make changes.
          </p>
        ) : null}

        {error ? (
          <p className="text-destructive mb-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">
            {success}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <div className="text-muted-foreground flex h-20 items-center justify-center rounded-md border border-dashed text-sm">
            No parts in the recipe yet. Add one to get started.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part</TableHead>
                  <TableHead className="w-[120px] text-right">Qty / bike</TableHead>
                  <TableHead className="w-[110px]">Optional</TableHead>
                  <TableHead>Notes</TableHead>
                  {canEdit ? <TableHead className="w-[60px]" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={`${row.partId}-${i}`}>
                    <TableCell>
                      <Link
                        href={`/parts/${row.partId}`}
                        className="font-medium hover:underline"
                      >
                        {row.partName}
                      </Link>
                      <div className="text-muted-foreground font-mono text-xs">
                        {row.partSku}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit ? (
                        <Input
                          inputMode="decimal"
                          value={row.quantity}
                          onChange={(e) =>
                            updateRow(i, { quantity: e.target.value })
                          }
                          className="ml-auto h-8 w-[90px] text-right"
                          aria-label={`Quantity for ${row.partSku}`}
                        />
                      ) : (
                        <span className="tabular-nums">{row.quantity}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <label className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={row.isOptional}
                          onChange={(e) =>
                            updateRow(i, { isOptional: e.target.checked })
                          }
                          className="size-4"
                          disabled={!canEdit}
                        />
                        {row.isOptional ? "Optional" : "Required"}
                      </label>
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <Input
                          value={row.notes}
                          onChange={(e) =>
                            updateRow(i, { notes: e.target.value })
                          }
                          placeholder="Optional"
                          className="h-8"
                          aria-label={`Notes for ${row.partSku}`}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {row.notes || "—"}
                        </span>
                      )}
                    </TableCell>
                    {canEdit ? (
                      <TableCell className="text-right">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => removeRow(i)}
                          aria-label={`Remove ${row.partSku}`}
                          disabled={isPending}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {canEdit ? (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onSaveAsVersion}
              disabled={isPending || rows.length === 0}
              title="Freeze this recipe as a new version. Past Manufacturing Orders keep referencing the old one."
            >
              <GitBranch aria-hidden /> Save as new version
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={isPending || !dirty}
            >
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </div>

      <PartPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        parts={parts}
        excludeIds={excludeIds}
        onPick={addPart}
      />
    </section>
  );
}
