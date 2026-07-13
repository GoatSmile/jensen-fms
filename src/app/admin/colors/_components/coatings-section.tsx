"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
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
import { appendField } from "@/lib/forms";

import {
  createCoating,
  setCoatingActive,
  updateCoating,
} from "../_actions/manage-coatings";

export type CoatingRow = {
  id: string;
  slug: string;
  labelEn: string;
  labelDa: string;
  sortOrder: number;
  isActive: boolean;
};

/**
 * Inline manager for the coating-finish vocabulary, embedded on /admin/colors
 * (Dennis didn't want a separate page just for coatings). Add a finish, rename
 * its labels, reorder, or archive it. The colour form's coating picker reads
 * the active rows.
 */
export function CoatingsSection({ rows }: { rows: CoatingRow[] }) {
  const router = useRouter();
  const t = useTranslations("adminColors");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Per-row editable label/sort state, seeded from props.
  const [edits, setEdits] = useState<
    Record<string, { labelEn: string; labelDa: string; sortOrder: string }>
  >(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        {
          labelEn: r.labelEn,
          labelDa: r.labelDa,
          sortOrder: String(r.sortOrder),
        },
      ]),
    ),
  );

  const [newEn, setNewEn] = useState("");
  const [newDa, setNewDa] = useState("");

  function isDirty(r: CoatingRow): boolean {
    const e = edits[r.id];
    if (!e) return false;
    return (
      e.labelEn.trim() !== r.labelEn ||
      e.labelDa.trim() !== r.labelDa ||
      e.sortOrder.trim() !== String(r.sortOrder)
    );
  }

  function setEdit(id: string, patch: Partial<(typeof edits)[string]>) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function onSave(r: CoatingRow) {
    const e = edits[r.id];
    setError(null);
    start(async () => {
      const fd = new FormData();
      appendField(fd, "label_en", e.labelEn.trim());
      appendField(fd, "label_da", e.labelDa.trim());
      appendField(fd, "slug", r.slug); // keep the slug stable across renames
      appendField(fd, "sort_order", e.sortOrder.trim());
      const res = await updateCoating(r.id, fd);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  function onToggleActive(r: CoatingRow) {
    setError(null);
    start(async () => {
      const res = await setCoatingActive(r.id, !r.isActive);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  function onAdd() {
    if (!newEn.trim()) {
      setError(t("englishLabelRequired"));
      return;
    }
    setError(null);
    start(async () => {
      const fd = new FormData();
      appendField(fd, "label_en", newEn.trim());
      appendField(fd, "label_da", newDa.trim());
      const res = await createCoating(fd);
      if (!res.ok) return setError(res.error);
      setNewEn("");
      setNewDa("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-md border">
      <header className="flex flex-col gap-0.5 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t("coatingsTitle")}</h2>
        <p className="text-muted-foreground text-xs">
          {t("coatingsDescription")}
        </p>
      </header>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("thFinishEnglish")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("thDanish")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("slug")}</TableHead>
              <TableHead className="w-[80px]">{t("thSort")}</TableHead>
              <TableHead className="w-[160px] text-right">{t("thActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const e = edits[r.id];
              const dirty = isDirty(r);
              return (
                <TableRow key={r.id} className={r.isActive ? "" : "opacity-60"}>
                  <TableCell>
                    <Input
                      value={e?.labelEn ?? ""}
                      onChange={(ev) => setEdit(r.id, { labelEn: ev.target.value })}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Input
                      value={e?.labelDa ?? ""}
                      onChange={(ev) => setEdit(r.id, { labelDa: ev.target.value })}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-muted-foreground font-mono text-xs">
                      {r.slug}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="numeric"
                      value={e?.sortOrder ?? ""}
                      onChange={(ev) =>
                        setEdit(r.id, { sortOrder: ev.target.value })
                      }
                      className="h-8 w-16"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {dirty ? (
                        <Button
                          type="button"
                          size="xs"
                          onClick={() => onSave(r)}
                          disabled={pending}
                        >
                          {t("save")}
                        </Button>
                      ) : !r.isActive ? (
                        <Badge variant="outline">{t("statusArchived")}</Badge>
                      ) : null}
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => onToggleActive(r)}
                        disabled={pending}
                      >
                        {r.isActive ? t("archive") : t("restore")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {/* Add a new finish */}
            <TableRow>
              <TableCell>
                <Input
                  value={newEn}
                  onChange={(e) => setNewEn(e.target.value)}
                  placeholder={t("newFinishEnglishPlaceholder")}
                  className="h-8"
                />
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <Input
                  value={newDa}
                  onChange={(e) => setNewDa(e.target.value)}
                  placeholder={t("danishOptionalPlaceholder")}
                  className="h-8"
                />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <span className="text-muted-foreground text-xs">{t("auto")}</span>
              </TableCell>
              <TableCell />
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={onAdd}
                  disabled={pending || !newEn.trim()}
                >
                  {t("addFinish")}
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {error ? (
        <p className="text-destructive px-4 py-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
