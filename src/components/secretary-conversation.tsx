"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";

import { loadAssistantView } from "@/app/_actions/assistant";
import { createCommandFromText } from "@/app/calls/_actions/command";
import { appliedSummary, pendingSummary } from "@/lib/inbound/command/applied-summary";
import { cn } from "@/lib/utils";

type Turn = {
  key: number;
  asked: string;
  /** The reply, once it is in. */
  answer: string | null;
  /** What was carried out, in words. */
  done: string[];
  /** What waits for the person's spoken yes. */
  waiting: string[];
  failed: boolean;
};

/**
 * The secretary, as a CONVERSATION (owner, 2026-10-21: "only the text,
 * question and answers, the results of the actions the system executes, and
 * nothing else … literally a conversation with the secretary. There should be
 * nothing to click"). Each spoken request is a turn: what was heard, the
 * reply (also spoken aloud), what was done, and what waits for a yes. It
 * LISTENS by itself after every reply and keeps waiting for the next
 * instruction until it is ended — the round button turns into its End (an
 * X, dark — red is for alarms) and Escape ends it too (owner, same day). A yes or no settles what waits; holding the button (or
 * ⌘K) opens the full panel with every control. Turns thread: each request
 * carries the previous one, so "and the one after?" and "yes" make sense.
 */
export type SecretaryState =
  | { kind: "listening"; level: number }
  | { kind: "hearing" }
  | { kind: "speaking" }
  | { kind: "ready" };

export function SecretaryConversation({
  question,
  onSpeak,
  onClose,
  state,
  notice,
}: {
  /** What the secretary is doing NOW — shown at the foot of the window. */
  state: SecretaryState;
  /** A one-line problem with the last thing said (not heard, no microphone). */
  notice: string | null;
  /** The next spoken request; a new key is a new turn. */
  question: { text: string; key: number } | null;
  /** Say a reply aloud, in the person's language. */
  onSpeak: (text: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("assistant");
  const tC = useTranslations("inboxCommand");
  const locale = useLocale();
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const lastId = useRef<string | null>(null);
  /** Every request of this conversation, oldest first — sent with the next, so "it" resolves. */
  const ids = useRef<string[]>([]);
  const handled = useRef<number | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!question || handled.current === question.key) return;
    handled.current = question.key;
    const key = question.key;
    const body = question.text;
    const update = (patch: Partial<Turn>) =>
      setTurns((all) => all.map((turn) => (turn.key === key ? { ...turn, ...patch } : turn)));
    setTurns((all) => [...all, { key, asked: body, answer: null, done: [], waiting: [], failed: false }]);

    void (async () => {
      const r = await createCommandFromText(body, lastId.current, { spoken: true, history: [...ids.current] });
      if (!r.ok) {
        update({ answer: r.error, failed: true });
        return onSpeak(r.error);
      }
      lastId.current = r.id;
      ids.current = [...ids.current, r.id];
      // Asked to SEE one record → straight there (the conversation closes with the route).
      if (r.openHref) return router.push(r.openHref);
      const v = await loadAssistantView(r.id);
      if (!v.ok || v.status === "failed") {
        update({ answer: t("failed"), failed: true });
        return onSpeak(t("failed"));
      }
      const text = v.answer?.text ?? "";
      // Only the newest reply's waiting actions can still be settled by a yes.
      setTurns((all) => all.map((turn) => (turn.key === key ? turn : { ...turn, waiting: [] })));
      update({
        answer: text,
        done: v.plan.actions.filter((a) => v.ctx.applied[a.id]).map((a) => appliedSummary(v.ctx.applied[a.id], tC, locale).text),
        waiting: v.plan.actions.filter((a) => !v.ctx.applied[a.id]).map((a) => pendingSummary(a, tC)),
      });
      if (text) onSpeak(text);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per spoken request
  }, [question?.key]);

  // The newest turn is the one being read, and the state line under it.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, state.kind]);

  return (
    <>
      <div
        role="log"
        aria-live="polite"
        aria-label={t("title")}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className={cn(
          "bg-popover text-popover-foreground shadow-popover fixed z-50 flex flex-col gap-4 overflow-y-auto rounded-2xl p-4",
          // Phone: across the width, above the round button — which is now its End.
          // Desktop: a column over it.
          "inset-x-2 bottom-20 max-h-[75dvh] md:inset-x-auto md:right-4 md:w-[420px] md:max-h-[min(680px,80vh)]",
        )}
      >
        <p className="text-ink-2 flex items-center gap-2 text-xs">
          <Sparkles className="text-brand-ink size-3.5" aria-hidden />
          {t("secretaryTitle")}
        </p>
        {turns.map((turn) => (
          <div key={turn.key} className="flex flex-col gap-2">
            <p className="bg-ground self-end rounded-2xl px-3 py-2 text-sm">{turn.asked}</p>
            {turn.answer === null ? (
              <p className="text-ink-2 inline-flex items-center gap-2 text-sm" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("secretaryThinking")}
              </p>
            ) : (
              <>
                {turn.answer ? (
                  <p className={cn("text-sm whitespace-pre-wrap", turn.failed && "text-destructive")}>{turn.answer}</p>
                ) : null}
                {turn.done.map((line, i) => (
                  <p key={`d${i}`} className="text-good text-sm">
                    ✓ {line}
                  </p>
                ))}
                {turn.waiting.map((line, i) => (
                  <p key={`w${i}`} className="text-money text-sm">
                    {t("secretaryWaiting", { what: line })}
                  </p>
                ))}
              </>
            )}
          </div>
        ))}
        {notice ? (
          <p className="text-destructive text-sm" role="alert">
            {notice}
          </p>
        ) : null}
        {/* Whose turn it is. Listening is the one that matters: it is the cue to speak. */}
        <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
          {state.kind === "listening" ? (
            <>
              <span className="bg-brand size-2.5 shrink-0 animate-pulse rounded-full" aria-hidden />
              <span className="text-brand-ink font-medium">{t("secretaryListening")}</span>
              <span className="bg-ground h-1.5 flex-1 overflow-hidden rounded-full" aria-hidden>
                <span
                  className="bg-brand block h-full rounded-full transition-[width] duration-100"
                  style={{ width: `${Math.round(state.level * 100)}%` }}
                />
              </span>
            </>
          ) : state.kind === "hearing" ? (
            <span className="text-ink-2 inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("askHearing")}
            </span>
          ) : state.kind === "speaking" ? (
            <span className="text-ink-2">{t("secretarySpeaking")}</span>
          ) : turns.some((turn) => turn.answer === null) ? null : (
            <span className="text-ink-2">{t("secretaryReady")}</span>
          )}
        </div>
        <div ref={end} />
      </div>
    </>
  );
}
