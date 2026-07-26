"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { saveProductionNote } from "../../_actions/save-production-note";

/**
 * Build-floor labeling note on the SO (Tier 2 Phase D). Inline-editable so it
 * can be set/changed mid-production; read-only display when the SO is terminal.
 * The note is surfaced to technicians on the /work build card + build workbench.
 */
export function ProductionNoteCard({
  soId,
  initialNote,
  editable,
}: {
  soId: string;
  initialNote: string | null;
  editable: boolean;
}) {
  const t = useTranslations("soDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [note, setNote] = useState(initialNote ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasNote = note.trim().length > 0;

  // Nothing to show and can't add → render nothing (keeps the page tidy).
  if (!hasNote && !editable) return null;

  function startEdit() {
    setDraft(note);
    setError(null);
    setEditing(true);
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveProductionNote(soId, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote(draft.trim());
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-md border bg-brand-wash">
      <header className="flex items-center justify-between gap-2 border-b border-brand/30 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-brand-ink">
          <Tag className="size-3.5" aria-hidden />
          {t("productionNoteTitle")}
        </h2>
        {editable && !editing ? (
          <Button size="xs" variant="outline" onClick={startEdit}>
            {hasNote ? t("edit") : t("addNote")}
          </Button>
        ) : null}
      </header>
      <div className="p-4">
        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("productionNotePlaceholder")}
              autoFocus
            />
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                disabled={isPending}
              >
                {tCommon("cancel")}
              </Button>
              <Button size="sm" onClick={onSave} disabled={isPending}>
                {isPending ? tCommon("saving") : t("save")}
              </Button>
            </div>
          </div>
        ) : hasNote ? (
          <p className="text-sm whitespace-pre-wrap text-brand-ink">
            {note}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm italic">
            {t("noProductionNote")}
          </p>
        )}
      </div>
    </section>
  );
}
