"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, Loader2, Mic, RotateCcw } from "lucide-react";

import { CallAudio } from "@/app/calls/_components/call-audio";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { NoteColumn, NoteItem, NotesBoard as Board } from "@/lib/inbox/notes";
import { cn } from "@/lib/utils";

import { CommandPlanPanel } from "@/app/calls/[id]/_components/command-plan-panel";

import { loadNoteSuggestions, markNotesDone, reopenNotes, type NoteSuggestions } from "../_actions/notes";

/** Past this age an open note wears its age in the caution hue (mirrors NOTE_STALE_DAYS). */
const STALE_DAYS = 7;
const UNDO_MS = 10_000;

/**
 * The notes half of the Inbox (plan-inbox-notes.md, slice 2): a column per
 * person, yours first, holding their OPEN notes. Today and yesterday show in
 * full; older open notes fold into one counted line that is always visible.
 * One Done per note and *Mark all done* per column, each with Undo; a note
 * opens in a side panel (full screen on a phone). On a phone the office sees
 * one column at a time, picked from the name chips; Finn sees only his.
 */
export function NotesBoard({ board, everyone }: { board: Board; everyone: boolean }) {
  const t = useTranslations("inboxPage");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>(board.columns[0]?.personId ?? null);
  const [openNote, setOpenNote] = useState<NoteItem | null>(null);
  const [confirm, setConfirm] = useState<NoteColumn | null>(null);
  const [undo, setUndo] = useState<{ ids: string[]; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [suggestions, setSuggestions] = useState<NoteSuggestions | null>(null);

  // A note's suggestions load when its panel opens — the board itself stays light.
  useEffect(() => {
    if (!openNote) return;
    let cancelled = false;
    loadNoteSuggestions(openNote.id).then((s) => {
      if (!cancelled) setSuggestions(s);
    });
    return () => {
      cancelled = true;
      setSuggestions(null);
    };
  }, [openNote]);

  // Fresh rows from the server replace what was hidden optimistically.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the server's rows
    setHidden(new Set());
  }, [board]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const columns = useMemo(
    () =>
      board.columns
        .map((c) => ({
          ...c,
          recent: c.recent.filter((n) => !hidden.has(n.id)),
          older: c.older.filter((n) => !hidden.has(n.id)),
        }))
        .filter((c) => c.recent.length + c.older.length > 0),
    [board.columns, hidden],
  );
  const activeKey = columns.some((c) => c.personId === active) ? active : (columns[0]?.personId ?? null);

  function done(ids: string[], label: string) {
    setError(null);
    setHidden((h) => new Set([...h, ...ids]));
    setOpenNote(null);
    start(async () => {
      const r = await markNotesDone(ids);
      if (!r.ok) {
        setHidden((h) => new Set([...h].filter((id) => !ids.includes(id))));
        return setError(r.error);
      }
      setUndo({ ids: r.ids, label });
    });
  }

  function reopen(ids: string[]) {
    setError(null);
    setUndo(null);
    setOpenNote(null);
    start(async () => {
      const r = await reopenNotes(ids);
      if (!r.ok) setError(r.error);
    });
  }

  const when = (n: NoteItem) =>
    n.dayKey === board.todayKey
      ? n.time
      : n.dayKey === board.yesterdayKey
        ? t("yesterdayAt", { time: n.time })
        : `${n.dayLabel} ${n.time}`;

  const anyOpen = columns.length > 0;

  return (
    <section className="flex flex-col gap-3" aria-label={t("notesTitle")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("notesTitle")}</h2>
        {board.empty.length > 0 ? (
          <p className="text-ink-3 flex flex-wrap gap-1.5 text-xs">
            {board.empty.map((p) => (
              <span key={p.personId} className="bg-surface rounded-full px-2.5 py-1">
                {t("emptyChip", { name: p.name })}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {!anyOpen ? (
        <p className="bg-surface text-ink-2 rounded-2xl px-4 py-3 text-sm">
          {everyone ? t("emptyEveryone") : t("emptyOwn")}
        </p>
      ) : (
        <>
          {/* Phone, office view: one column at a time, picked by name. */}
          {everyone && columns.length > 1 ? (
            <nav className="flex gap-1.5 overflow-x-auto md:hidden" aria-label={t("peopleAria")}>
              {columns.map((c) => (
                <button
                  key={c.personId}
                  type="button"
                  onClick={() => setActive(c.personId)}
                  aria-current={c.personId === activeKey ? "true" : undefined}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-sm",
                    c.personId === activeKey ? "bg-brand text-on-brand" : "bg-surface text-ink-2",
                  )}
                >
                  {c.own ? t("you") : c.name} {c.recent.length + c.older.length}
                </button>
              ))}
            </nav>
          ) : null}

          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {columns.map((c) => {
              const count = c.recent.length + c.older.length;
              const showOlder = unfolded.has(c.personId);
              const oldest = c.older.reduce((m, n) => Math.max(m, n.ageDays), 0);
              return (
                <div
                  key={c.personId}
                  className={cn(
                    "bg-surface flex min-w-0 flex-col rounded-2xl p-3",
                    everyone && c.personId !== activeKey && "max-md:hidden",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 px-1 pb-2">
                    <span className="font-medium">
                      {c.own ? t("columnYou", { name: c.name }) : c.name}
                      <span className="text-ink-2 ml-1.5 tabular-nums">· {count}</span>
                    </span>
                    {count > 1 ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(c)} disabled={pending}>
                        {t("markAllDone")}
                      </Button>
                    ) : null}
                  </div>
                  <ul className="divide-rule flex flex-col divide-y">
                    {[...c.recent, ...(showOlder ? c.older : [])].map((n) => (
                      <NoteCard
                        key={n.id}
                        note={n}
                        when={when(n)}
                        column={c}
                        onOpen={() => setOpenNote(n)}
                        onDone={() => done([n.id], n.body ?? "")}
                        pending={pending}
                      />
                    ))}
                  </ul>
                  {c.older.length > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setUnfolded((u) => {
                          const next = new Set(u);
                          if (next.has(c.personId)) next.delete(c.personId);
                          else next.add(c.personId);
                          return next;
                        })
                      }
                      className="text-ink-2 hover:text-ink flex items-center gap-1.5 px-1 pt-2 text-left text-sm"
                    >
                      <ChevronRight className={cn("size-3.5 transition-transform", showOlder && "rotate-90")} aria-hidden />
                      {showOlder
                        ? t("olderFoldOpen")
                        : t("olderFold", { n: c.older.length })}
                      {!showOlder ? (
                        <span className={cn("ml-auto", oldest > STALE_DAYS ? "text-money" : "")}>
                          {t("oldestDays", { n: oldest })}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      {board.done.length > 0 ? (
        <details className="bg-surface rounded-2xl">
          <summary className="text-ink-2 cursor-pointer list-none px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
            {t("doneFold", { n: board.done.length })}
          </summary>
          <ul className="divide-rule border-rule divide-y border-t">
            {board.done.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <Check className="text-good mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{n.body ?? t("noText")}</span>
                  <span className="text-ink-3 block text-xs">
                    {[n.speakerName, when(n), n.closedByName ? t("closedBy", { name: n.closedByName }) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => reopen([n.id])} disabled={pending}>
                  {t("reopen")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* The note itself: full text, the recording, where it was said. A side
          panel on a desktop, the whole screen on a phone. */}
      <Sheet open={openNote !== null} onOpenChange={(o) => !o && setOpenNote(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto data-[side=right]:w-full sm:data-[side=right]:max-w-md">
          {openNote ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Mic className="size-4" aria-hidden />
                  {openNote.speakerName ?? t("noteTitle")}
                </SheetTitle>
                <SheetDescription>
                  {[
                    when(openNote),
                    openNote.addresseeName && openNote.addresseeId !== openNote.speakerId
                      ? t("toPerson", { name: openNote.addresseeName })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 pb-6">
                {openNote.status === "received" ? (
                  <p className="text-ink-2 inline-flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t("transcribing")}
                  </p>
                ) : openNote.status === "failed" ? (
                  <p className="text-money text-sm">{t("transcribeFailed")}</p>
                ) : null}
                {openNote.body ? <p className="text-base whitespace-pre-wrap">{openNote.body}</p> : null}
                {openNote.hasAudio ? <CallAudio messageId={openNote.id} /> : null}
                {suggestions?.ok && suggestions.plan.actions.length > 0 ? (
                  <CommandPlanPanel
                    messageId={openNote.id}
                    plan={suggestions.plan}
                    applied={suggestions.ctx.applied}
                    templates={suggestions.ctx.templates}
                    segments={suggestions.ctx.segments}
                    colors={suggestions.ctx.colors}
                    customers={suggestions.ctx.customers}
                    suggestedCustomers={suggestions.ctx.suggestedCustomers}
                    contacts={suggestions.ctx.contacts}
                    onChanged={() => loadNoteSuggestions(openNote.id).then(setSuggestions)}
                  />
                ) : suggestions?.ok && !suggestions.planned && openNote.status !== "failed" ? (
                  <p className="text-ink-2 inline-flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t("reading")}
                  </p>
                ) : null}
                {openNote.contextPath ? (
                  <p className="text-ink-2 text-sm">
                    {t("saidOn")}{" "}
                    <Link href={openNote.contextPath} className="text-brand-ink underline underline-offset-2">
                      {openNote.contextPath}
                    </Link>
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {openNote.closedAt ? (
                    <Button type="button" variant="outline" onClick={() => reopen([openNote.id])} disabled={pending}>
                      <RotateCcw aria-hidden />
                      {t("reopen")}
                    </Button>
                  ) : (
                    <Button type="button" onClick={() => done([openNote.id], openNote.body ?? "")} disabled={pending}>
                      <Check aria-hidden />
                      {t("done")}
                    </Button>
                  )}
                  <Link href={`/calls/${openNote.id}`} className="text-brand-ink ml-auto text-sm underline underline-offset-2">
                    {t("openFull")}
                  </Link>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Mark all done: says what it is about to do, then one Undo covers it. */}
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          {confirm ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("markAllTitle")}</DialogTitle>
                <DialogDescription>
                  {t("markAllBody", {
                    n: confirm.recent.length + confirm.older.length,
                    name: confirm.own ? t("you") : confirm.name,
                    left: [...confirm.recent, ...confirm.older].filter((n) => n.openSuggestions > 0).length,
                  })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const ids = [...confirm.recent, ...confirm.older].map((n) => n.id);
                    setConfirm(null);
                    done(ids, t("markAllLabel", { n: ids.length }));
                  }}
                >
                  {t("markAllButton", { n: confirm.recent.length + confirm.older.length })}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Undo — clear of the assistant's button (bottom right): bottom left on a
          phone, centred on a desktop, where bottom left is the sidebar's footer. */}
      {undo ? (
        <div
          role="status"
          className="bg-popover text-popover-foreground shadow-popover fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-6.5rem)] items-center gap-3 rounded-2xl px-4 py-3 text-sm md:left-1/2 md:max-w-md md:-translate-x-1/2"
        >
          <span className="min-w-0 truncate">{t("doneToast", { label: undo.label })}</span>
          <button type="button" onClick={() => reopen(undo.ids)} className="text-brand-ink shrink-0 font-medium underline">
            {t("undo")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function NoteCard({
  note,
  when,
  column,
  onOpen,
  onDone,
  pending,
}: {
  note: NoteItem;
  when: string;
  column: NoteColumn;
  onOpen: () => void;
  onDone: () => void;
  pending: boolean;
}) {
  const t = useTranslations("inboxPage");
  // Who else is involved, from this column's point of view.
  const fromOther = note.speakerId && note.speakerId !== column.personId ? note.speakerName : null;
  const toOther =
    note.addresseeId && note.addresseeId !== column.personId && note.addresseeId !== note.speakerId
      ? note.addresseeName
      : null;
  return (
    <li className="flex items-start gap-2 py-2.5">
      <button type="button" onClick={onOpen} className="hover:bg-ground min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left">
        <span className="text-ink-2 flex flex-wrap items-center gap-x-1.5 text-xs">
          <span className="tabular-nums">{when}</span>
          {fromOther ? <span>· {t("fromPerson", { name: fromOther })}</span> : null}
          {toOther ? <span>· {t("toPerson", { name: toOther })}</span> : null}
          {note.dueDate ? (
            <span className="bg-brand-wash text-brand-ink rounded-full px-1.5 font-medium">
              {t("dueOn", { date: note.dueDate })}
            </span>
          ) : null}
          {note.openSuggestions > 0 ? (
            <span className="bg-money-wash text-money rounded-full px-1.5 font-medium">
              {t("suggestions", { n: note.openSuggestions })}
            </span>
          ) : null}
          {note.ageDays > STALE_DAYS ? (
            <span className="bg-money-wash text-money rounded-full px-1.5 font-medium">
              {t("ageDays", { n: note.ageDays })}
            </span>
          ) : null}
        </span>
        {note.status === "received" ? (
          <span className="text-ink-2 mt-0.5 inline-flex items-center gap-1.5 text-sm">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t("transcribing")}
          </span>
        ) : note.status === "failed" ? (
          <span className="text-money mt-0.5 block text-sm">{t("transcribeFailed")}</span>
        ) : (
          <span className="mt-0.5 line-clamp-3 text-sm">{note.body ?? t("noText")}</span>
        )}
      </button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onDone}
        disabled={pending}
        aria-label={t("doneAria", { text: (note.body ?? "").slice(0, 40) })}
        className="shrink-0"
      >
        <Check aria-hidden />
        <span className="max-sm:sr-only">{t("done")}</span>
      </Button>
    </li>
  );
}
