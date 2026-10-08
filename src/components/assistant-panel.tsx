"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { History, ScanLine, Sparkles, StickyNote, X } from "lucide-react";

import { readDictationReady } from "@/app/_actions/dictation-ready";
import { loadAssistantView, type AssistantView } from "@/app/_actions/assistant";
import { createCommandFromText } from "@/app/calls/_actions/command";
import { saveTypedNote, setAssistantMode } from "@/app/_actions/notes";
import { CommandPlanPanel } from "@/app/calls/[id]/_components/command-plan-panel";
import { DictateButton } from "@/components/dictate-button";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { targetHref } from "@/lib/assistant/answer";
import { contextFromPath } from "@/lib/notes/context";
import { ASSISTANT_MODES, type AssistantMode } from "@/lib/notes/mode";
import { cn } from "@/lib/utils";

type Props = {
  onClose: () => void;
  /** Scan lives inside the panel (owner, 2026-10-01: one button, not two). */
  canScan: boolean;
  /** What a press of the floating button does — chosen here, by the person. */
  mode: AssistantMode;
  /** Applies a pick to the button at once; the save follows. */
  onModeChange: (mode: AssistantMode) => void;
};

/**
 * The assistant's floating panel (DECISIONS 2026-10-01): ask, dictate or
 * scan from any page. A floating surface, so it wears the overlay shadow; on
 * a phone it spans the width above the corner, on a desktop it is a column
 * anchored over the button. The answer, a record to open, the choices and
 * the drafted actions (applied with one tap) all appear here; the full
 * history is /commands.
 *
 * Dictation fills the box and the person presses Send (owner) — a misheard
 * word is fixed first. A follow-up within the panel threads the previous
 * request (the assistant remembers one exchange, ≤10 min).
 */
export function AssistantPanel({ onClose, canScan, mode, onModeChange }: Props) {
  const t = useTranslations("assistant");
  const locale = useLocale();
  const router = useRouter();
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [view, setView] = useState<AssistantView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pending, start] = useTransition();
  const [noteSaved, setNoteSaved] = useState<string | null>(null);
  const [modePending, startMode] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    box.current?.focus();
    let cancelled = false;
    readDictationReady().then((r) => {
      if (!cancelled) setReady(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Honest progress: how long it has been working, not invented steps.
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 500);
    return () => {
      clearInterval(timer);
      setSeconds(0);
    };
  }, [pending]);

  async function refresh(id: string) {
    setView(await loadAssistantView(id));
  }

  function send() {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    start(async () => {
      const r = await createCommandFromText(body, requestId);
      if (!r.ok) return setError(r.error);
      setText("");
      // Asked to SEE one record → straight there.
      if (r.openHref) {
        onClose();
        router.push(r.openHref);
        return;
      }
      setAsked(body);
      setRequestId(r.id);
      await refresh(r.id);
    });
  }

  /** Keep what is in the box as a note — no answer, it waits in the person's list. */
  function saveAsNote() {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    start(async () => {
      const r = await saveTypedNote(body, contextFromPath(window.location.pathname, locale));
      if (!r.ok) return setError(r.error);
      setText("");
      setNoteSaved(r.id);
    });
  }

  function chooseMode(next: string) {
    const previous = mode;
    onModeChange(next as AssistantMode);
    startMode(async () => {
      const r = await setAssistantMode(next);
      if (!r.ok) {
        // Not saved: put the button back the way it was, and say so.
        onModeChange(previous);
        setError(r.error);
      }
    });
  }

  function newQuestion() {
    setAsked(null);
    setRequestId(null);
    setView(null);
    setError(null);
    box.current?.focus();
  }

  const answer = view?.ok ? view.answer : null;

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className={cn(
        "bg-popover text-popover-foreground shadow-popover fixed z-50 flex flex-col rounded-2xl",
        // Phone: across the width, above the corner. Desktop: a column over the button.
        "inset-x-2 bottom-2 max-h-[85dvh] md:inset-x-auto md:right-4 md:bottom-20 md:w-[420px] md:max-h-[min(680px,80vh)]",
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <Sparkles className="text-brand-ink size-4" aria-hidden />
        <span className="text-sm font-medium">{t("title")}</span>
        <Link
          href="/commands"
          onClick={onClose}
          className="text-ink-2 hover:text-ink ml-auto inline-flex items-center gap-1 text-xs"
        >
          <History className="size-3.5" aria-hidden />
          {t("history")}
        </Link>
        <button type="button" onClick={onClose} aria-label={t("close")} className="text-ink-2 hover:text-ink p-1">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {noteSaved && !asked && !pending ? (
        <p className="text-ink-2 flex items-center gap-2 px-4 pb-2 text-sm" role="status">
          {t("noteSaved")}
          <Link href={`/calls/${noteSaved}`} onClick={onClose} className="text-brand-ink underline underline-offset-2">
            {t("noteOpen")}
          </Link>
        </p>
      ) : null}

      {asked || pending || error ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3">
          {asked ? <p className="text-ink-2 text-xs">{t("youAsked", { text: asked })}</p> : null}
          {pending ? (
            <p className="text-ink-2 text-sm" role="status">
              {t("working", { s: seconds })}
            </p>
          ) : null}
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          {view && !view.ok ? <p className="text-destructive text-sm">{t("failed")}</p> : null}
          {view?.ok && view.status === "failed" ? (
            <p className="text-destructive text-sm" role="alert">
              {t("failed")}
            </p>
          ) : null}
          {answer?.text ? <p className="text-sm whitespace-pre-wrap">{answer.text}</p> : null}
          {answer?.open ? (
            <Link
              href={targetHref(answer.open)}
              onClick={onClose}
              className="bg-brand-wash text-brand-ink inline-flex w-fit items-center rounded-full px-3 py-1.5 text-sm font-medium"
            >
              {t("open", { label: answer.open.label })}
            </Link>
          ) : null}
          {answer && answer.choices.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {answer.choices.map((c) => (
                <li key={`${c.kind}:${c.id}`}>
                  <Link
                    href={targetHref(c)}
                    onClick={onClose}
                    className="text-brand-ink text-sm underline underline-offset-2"
                  >
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {view?.ok && requestId && view.plan.actions.length > 0 ? (
            <CommandPlanPanel
              messageId={requestId}
              plan={view.plan}
              applied={view.ctx.applied}
              templates={view.ctx.templates}
              segments={view.ctx.segments}
              colors={view.ctx.colors}
              customers={view.ctx.customers}
              suggestedCustomers={view.ctx.suggestedCustomers}
              contacts={view.ctx.contacts}
              onChanged={() => refresh(requestId)}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-ink-2 px-4 pb-2 text-xs">{t("hint")}</p>
      )}

      <div className="border-rule flex flex-col gap-2 border-t px-4 pt-3 pb-4">
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Return sends; Shift+Return is a new line.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={requestId ? t("followUpPlaceholder") : t("placeholder")}
          className="border-rule bg-ground w-full resize-none rounded-lg border p-2.5 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={send} disabled={pending || !text.trim()}>
            {pending ? t("sending") : t("send")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={saveAsNote} disabled={pending || !text.trim()}>
            <StickyNote aria-hidden />
            {t("saveAsNote")}
          </Button>
          <DictateButton
            onAppend={(txt) => setText((prev) => (prev.trim() ? `${prev} ${txt}` : txt))}
            label={t("dictate")}
            ready={ready}
          />
          {requestId && !pending ? (
            <button type="button" onClick={newQuestion} className="text-ink-2 hover:text-ink text-xs underline">
              {t("newQuestion")}
            </button>
          ) : null}
          {canScan ? (
            <Button asChild size="sm" variant="ghost" className="ml-auto">
              <Link href="/scan" onClick={onClose}>
                <ScanLine aria-hidden />
                {t("scan")}
              </Link>
            </Button>
          ) : null}
        </div>
        {/* The person's own choice of what a press of the button does. Holding
            the button (or ⌘K) always opens this panel, so it can be changed back. */}
        <label className="text-ink-2 flex flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:gap-2">
          <span className="shrink-0">{t("modeLabel")}</span>
          <Select value={mode} onValueChange={chooseMode} disabled={modePending}>
            <SelectTrigger size="sm" className="h-8 w-full min-w-0 text-xs sm:flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSISTANT_MODES.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {t(`mode_${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
    </div>
  );
}
