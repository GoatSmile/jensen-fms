"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";

import { loadAssistantView } from "@/app/_actions/assistant";
import { createCommandFromText, type CommandResult } from "@/app/calls/_actions/command";
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
/** A spoken request on its way in, with when its recording ended (for timing). */
export type SpokenQuestion = {
  text: string;
  key: number;
  language: "da" | "en";
  /** `performance.now()` when the recording ended. */
  capturedAt?: number;
  transcribeMs?: number;
};

/** One answered turn, for the voice and its timing (recordSecretaryTimings). */
export type SpokenTurn = {
  messageId: string;
  capturedAt?: number;
  transcribeMs?: number;
  requestMs: number;
  /** `performance.now()` when the request was sent. */
  sentAt: number;
  /** `performance.now()` when the first sentence of a streamed reply arrived. */
  firstSentenceAt?: number;
  /** `performance.now()` when the answer arrived. */
  answeredAt: number;
};

/**
 * Ask through /api/secretary, which streams the reply's sentences as they are
 * written and then the result. "unstarted" when nothing came back at all, so
 * the caller can ask the action instead; a stream that breaks AFTER it began
 * is a failure, never a second request (that could book twice).
 */
async function askStreaming(
  body: { text: string; priorId: string | null; history: string[]; language: string; page: string },
  onSentence: (sentence: string) => void,
): Promise<CommandResult | "unstarted"> {
  let began = false;
  let result: CommandResult | null = null;
  try {
    const res = await fetch("/api/secretary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) return "unstarted";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      began = true;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as { sentence?: unknown; result?: CommandResult };
        if (typeof msg.sentence === "string") onSentence(msg.sentence);
        if (msg.result) result = msg.result;
      }
    }
  } catch {
    if (!began) return "unstarted";
  }
  // Read to the end (the server closes right after the result), so the request is not cut off.
  return result ?? { ok: false, error: "" };
}

export type SecretaryState =
  | { kind: "listening"; level: number }
  | { kind: "hearing" }
  | { kind: "speaking" }
  | { kind: "ready" };

export function SecretaryConversation({
  question,
  onSentence,
  onSpeak,
  onClose,
  state,
  notice,
}: {
  /** What the secretary is doing NOW — shown at the foot of the window. */
  state: SecretaryState;
  /** A one-line problem with the last thing said (not heard, no microphone). */
  notice: string | null;
  /** The next spoken request; a new key is a new turn. `language` is the one it was heard in. */
  question: SpokenQuestion | null;
  /** One sentence of a reply still being written — said at once (2026-10-22). */
  onSentence: (sentence: string) => void;
  /**
   * Say a reply aloud, in the language of the conversation; a stored turn
   * streams and is timed. After sentences, `text` is only what was NOT said
   * yet (the lines the code added) — and the call ends that reply.
   */
  onSpeak: (text: string, turn?: SpokenTurn) => void;
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
    const language = question.language;
    const update = (patch: Partial<Turn>) =>
      setTurns((all) => all.map((turn) => (turn.key === key ? { ...turn, ...patch } : turn)));
    setTurns((all) => [...all, { key, asked: body, answer: null, done: [], waiting: [], failed: false }]);

    const { capturedAt, transcribeMs } = question;
    void (async () => {
      const sent = performance.now();
      const opts = {
        spoken: true,
        history: [...ids.current],
        language,
        // The page the person has open, so "this bike" resolves.
        page: window.location.pathname,
      };
      // What has been said aloud already, sentence by sentence as it was written.
      let said = "";
      let firstSentenceAt: number | undefined;
      const streamed = await askStreaming({ text: body, priorId: lastId.current, ...opts }, (sentence) => {
        firstSentenceAt ??= performance.now();
        said += sentence;
        update({ answer: said });
        onSentence(sentence);
      });
      // The stream never started (an older server, a refused route): the action, as before.
      const r = streamed === "unstarted" ? await createCommandFromText(body, lastId.current, opts) : streamed;
      const answeredAt = performance.now();
      if (!r.ok) {
        const error = r.error || t("failed");
        update({ answer: error, failed: true });
        return onSpeak(error);
      }
      lastId.current = r.id;
      ids.current = [...ids.current, r.id];
      const turnOf = () => ({ messageId: r.id, capturedAt, transcribeMs, requestMs: answeredAt - sent, sentAt: sent, firstSentenceAt, answeredAt });
      // Asked to SEE one record → straight there (the conversation closes with the route).
      if (r.openHref) {
        if (said) onSpeak("", turnOf());
        return router.push(r.openHref);
      }
      // The answer came with the request; an older server sends none.
      const v = r.view ?? (await loadAssistantView(r.id));
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
      // After sentences, only the rest: what the code added after the model.
      // A reply that does not begin with what was said (rare: a re-written
      // answer) is said whole — repeated rather than lost.
      const head = said.trim();
      const rest = !head ? text : text.startsWith(head) ? text.slice(head.length) : text;
      if (text || said) onSpeak(rest, turnOf());
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
