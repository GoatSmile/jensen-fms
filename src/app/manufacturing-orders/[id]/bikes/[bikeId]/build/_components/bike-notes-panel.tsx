"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { StickyNote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";

import { updateBikeNotes } from "../_actions/bike-notes";

/**
 * The note on THIS bike, at the top of the build screen where the builder
 * looks — not per part (15 Sep, Dennis: a spare chain-lock code goes "up
 * here"). Saves on its own button, so a half-typed note never rides along
 * with Finish build.
 */
export function BikeNotesPanel({
  moId,
  bikeId,
  initialNotes,
}: {
  moId: string;
  bikeId: string;
  initialNotes: string | null;
}) {
  const t = useTranslations("build");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = notes.trim() !== saved.trim();

  function save() {
    setError(null);
    start(async () => {
      const r = await updateBikeNotes(moId, bikeId, notes);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(notes);
    });
  }

  return (
    <Panel
      title={t("bikeNotesTitle")}
      description={t("bikeNotesDesc")}
      contentClassName="flex flex-col gap-2"
    >
      <Textarea
        id="bike-notes"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t("bikeNotesPlaceholder")}
        aria-label={t("bikeNotesTitle")}
      />
      <div className="flex items-center justify-end gap-3">
        {error ? (
          <p className="text-destructive mr-auto text-sm" role="alert">
            {error}
          </p>
        ) : !dirty && saved.trim() !== "" ? (
          <p className="text-ink-2 mr-auto text-xs" role="status">
            {t("bikeNotesSaved")}
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={save}
          disabled={!dirty || pending}
        >
          <StickyNote aria-hidden />
          {pending ? t("bikeNotesSaving") : t("bikeNotesSave")}
        </Button>
      </div>
    </Panel>
  );
}
