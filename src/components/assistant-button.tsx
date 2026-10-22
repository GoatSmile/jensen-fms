"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Mic, Sparkles, Square, X } from "lucide-react";

import { recordSecretaryTimings } from "@/app/_actions/assistant";
import { mintNoteUpload, reportNoteFailure, saveSpokenNote, type NoteFailureStage } from "@/app/_actions/notes";
import { transcribeRecording } from "@/lib/dictation/transcribe";
import { NOTE_SILENCE_STOP, useRecorder } from "@/lib/dictation/use-recorder";
import { contextFromPath } from "@/lib/notes/context";
import { isNoteMode, isVoiceMode, type AssistantMode } from "@/lib/notes/mode";
import { useSpeaker } from "@/lib/speech/use-speaker";
import { cn } from "@/lib/utils";

import { AssistantPanel } from "./assistant-panel";
import { SecretaryConversation, type SpokenQuestion, type SpokenTurn } from "./secretary-conversation";

/** Holding the button this long opens the panel, whatever the mode. */
const LONG_PRESS_MS = 500;
/** How long "saved" / "nothing heard" stays up. */
const TOAST_MS = 4000;

type Toast =
  // What was said to the secretary, on its way to text — or failed on the way.
  | { kind: "hearing" }
  | { kind: "unheard"; blob: Blob }
  | { kind: "no_speech" }
  // A spoken NOTE (note modes): saving, saved, or failed with the audio kept.
  | { kind: "saving" }
  | { kind: "saved"; id: string }
  | { kind: "failed"; blob: Blob };

/**
 * The ONE floating button (owner, 2026-10-01: "all one button") — bottom
 * right on every screen, phone and desktop alike. ⌘K / Ctrl+K opens the panel
 * from the keyboard, and so does holding the button, in every mode.
 *
 * It is THE SECRETARY (owner, 2026-10-21: "no longer a note-taking
 * functionality — an engage-the-secretary powerful functionality"). In
 * `ask_voice` a press records a question or an instruction; a pause (or a
 * second press) ends it; it is transcribed and asked at once, the panel opens
 * on the answer with what was heard above it, and the answer is SPOKEN in the
 * person's language. Safe things it was asked to do are carried out for a
 * person with *act right away* on (server side), and the reply says what was
 * done. A note is one of those things — when asked for. While the panel is
 * open the button stays pressable, so a follow-up is one more press.
 * `ask` keeps the press for opening the panel to type; the note modes
 * (`note_toggle`, `note_vad`) record a spoken NOTE instead, saved before it is
 * transcribed — options for now, no longer the default.
 */
export function AssistantButton({
  allowedCaps,
  mode: savedMode,
}: {
  /** Role capability scope; null = everything (gate off). */
  allowedCaps: string[] | null;
  /** The person's stored choice; a change in the panel applies at once. */
  mode: AssistantMode;
}) {
  // Held here so picking a mode in the panel changes the button NOW — the
  // layout that passed the stored value does not re-render on a pick.
  const [mode, setMode] = useState<AssistantMode>(savedMode);
  const t = useTranslations("assistant");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /** A spoken request opens the conversation; holding the button or ⌘K, the full panel. */
  const [view, setView] = useState<"conversation" | "full">("full");
  /** The secretary's conversation is on screen — the round button is its End. */
  const conversing = open && view === "conversation";
  const [shortcut, setShortcut] = useState("Ctrl K");
  const [toast, setToast] = useState<Toast | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const voiceMode = isVoiceMode(mode);
  const noteMode = isNoteMode(mode);
  /** A spoken question for the panel to ask; the key makes a repeat a new one. */
  const [question, setQuestion] = useState<SpokenQuestion | null>(null);
  const speaker = useSpeaker();
  /** The language set up for this person (theirs, else the app's). */
  const language: "da" | "en" = locale === "en" ? "en" : "da";
  /**
   * The language the secretary answers in (Dennis, 2026-10-21: "respond in
   * the language you speak"). A conversation STARTS in the set language
   * (owner, same day) and follows whatever was last heard.
   */
  const replyLanguage = useRef<"da" | "en">(language);
  /** The secretary is reading a reply aloud. */
  const [speaking, setSpeaking] = useState(false);
  /** This recording was started by the conversation itself, not a press. */
  const autoListen = useRef(false);
  /** Read inside async callbacks: is the conversation still on screen? */
  const inConversation = useRef(false);
  useEffect(() => {
    inConversation.current = open && view === "conversation" && mode === "ask_voice";
  }, [open, view, mode]);

  const hidden =
    pathname === "/login" ||
    pathname === "/scan" ||
    pathname.startsWith("/b/") ||
    pathname.startsWith("/report") ||
    // The work-order workspace keeps the bottom edge for its action bar.
    /^\/work\/(?!paint-runs|deliveries)[^/]+/.test(pathname) ||
    // The customer map is full-bleed Leaflet; the button would sit on its controls.
    pathname === "/organizations/map";

  const ask = useCallback(
    async (blob: Blob) => {
      setToast({ kind: "hearing" });
      // The recording has just ended: the person's wait starts now.
      const capturedAt = performance.now();
      // A new conversation starts from the set language; one under way keeps
      // its own, which is also the fallback when detection misses (a bare "ja").
      const current = inConversation.current ? replyLanguage.current : language;
      const r = await transcribeRecording(blob, current);
      const transcribeMs = performance.now() - capturedAt;
      if (!r.ok) {
        report(r.reason === "upload" ? "upload" : "transcribe", r.detail ?? r.reason, { bytes: blob.size, question: true });
        return setToast({ kind: "unheard", blob });
      }
      const text = r.text.trim();
      if (!text) return setToast({ kind: "no_speech" });
      setToast(null);
      replyLanguage.current = r.language ?? current;
      setQuestion({ text, key: Date.now(), language: replyLanguage.current, capturedAt, transcribeMs });
      setView("conversation");
      setOpen(true);
    },
    [language],
  );

  const save = useCallback(
    async (blob: Blob) => {
      setToast({ kind: "saving" });
      let stage: NoteFailureStage = "mint";
      try {
        const minted = await mintNoteUpload();
        if (!minted.ok) throw new Error(minted.error);
        stage = "upload";
        const put = await fetch(minted.signedUrl, {
          method: "PUT",
          headers: { "content-type": "audio/wav" },
          body: blob,
        });
        if (!put.ok) throw new Error(`upload ${put.status}: ${(await put.text().catch(() => "")).slice(0, 300)}`);
        stage = "save";
        const r = await saveSpokenNote(minted.path, contextFromPath(window.location.pathname, locale));
        if (!r.ok) throw new Error(r.error);
        setToast({ kind: "saved", id: r.id });
      } catch (e) {
        // The recording is still here — Retry, never "say it again".
        console.error("[note] save failed:", e);
        report(stage, e instanceof Error ? e.message : String(e), { bytes: blob.size });
        setToast({ kind: "failed", blob });
      }
    },
    [locale],
  );

  const recorder = useRecorder({
    onCaptured: (blob) => void (noteMode ? save(blob) : ask(blob)),
    // Press-again-to-save records until the second press; the rest end on a pause.
    silenceStop: mode === "note_toggle" ? undefined : NOTE_SILENCE_STOP,
    onNoSpeech: (heard) => {
      // In the conversation nobody spoke yet: keep waiting for the next
      // instruction (owner: "the system waits for my next instruction") —
      // a fresh recording each window, so nothing piles up.
      if (inConversation.current) {
        autoListen.current = true;
        void restartListening.current();
        return;
      }
      report("no_speech", null, heard);
      setToast({ kind: "no_speech" });
    },
  });
  const recording = recorder.phase === "recording";
  // onNoSpeech fires from inside the recorder, which cannot name itself.
  const restartListening = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    restartListening.current = () => recorder.start();
  }, [recorder]);

  // The recorder's own refusals (no mic permission, nothing captured).
  useEffect(() => {
    if (recorder.error) report(recorder.error, null, {});
  }, [recorder.error]);

  useEffect(() => {
    if (toast?.kind !== "no_speech" && toast?.kind !== "saved") return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    // After hydration only, so server and client render the same label first.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform read
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("⌘K");
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setView("full");
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Escape ends the conversation from the keyboard.
  useEffect(() => {
    if (!conversing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [conversing]);

  // A navigation (an Open, a choice) closes the panel.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the route
    setOpen(false);
  }, [pathname]);

  /**
   * Hands-free (owner, 2026-10-21: "continue conversations without me needing
   * to press"): the reply is read aloud, and when it has FINISHED — so the mic
   * does not hear the secretary — the conversation listens again by itself.
   * Nobody speaking for a while ends it quietly (see onNoSpeech).
   */
  async function reply(text: string, turn?: SpokenTurn) {
    setSpeaking(true);
    await speaker.say(text, replyLanguage.current, {
      messageId: turn?.messageId,
      // The first sound ends the person's wait — keep where the time went.
      onStart: (voice) => {
        if (!turn) return;
        const now = performance.now();
        void recordSecretaryTimings(turn.messageId, {
          transcribeMs: turn.transcribeMs,
          requestMs: turn.requestMs,
          voiceMs: now - turn.answeredAt,
          totalMs: turn.capturedAt === undefined ? undefined : now - turn.capturedAt,
          voice,
        }).catch(() => {});
      },
    });
    setSpeaking(false);
    if (!inConversation.current || recorder.phase === "recording") return;
    autoListen.current = true;
    cue("start");
    await recorder.start();
  }

  const endRef = useRef<() => void>(() => {});
  useEffect(() => {
    endRef.current = closeConversation;
  });

  function closeConversation() {
    setOpen(false);
    setQuestion(null);
    speaker.stop();
    setSpeaking(false);
    if (recorder.phase === "recording") recorder.cancel();
    autoListen.current = false;
  }

  async function press() {
    if (longPressed.current) return;
    // In the conversation the round button IS its end (owner, 2026-10-21).
    if (conversing) return closeConversation();
    if (!voiceMode) {
      setView("full");
      return setOpen((o) => !o);
    }
    if (recording) return recorder.stop();
    if (toast?.kind === "hearing" || toast?.kind === "saving") return;
    autoListen.current = false;
    // Talking over the secretary stops her — and keeps her voice out of the mic.
    speaker.stop();
    // Inside the press: the answer arrives seconds later, and a phone only
    // lets it be heard if sound started here (use-speaker.ts).
    speaker.prime();
    setToast(null);
    cue("start");
    await recorder.start();
  }

  function pointerDown() {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      if (recording) recorder.cancel();
      autoListen.current = false;
      setView("full");
      setOpen(true);
    }, LONG_PRESS_MS);
  }

  function pointerUp() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  if (hidden) return null;
  const canScan = allowedCaps === null || allowedCaps.includes("scan");
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const Icon = conversing ? X : recording ? Square : voiceMode ? Mic : Sparkles;
  const idleLabel = noteMode ? t("noteButtonLabel") : voiceMode ? t("askVoiceLabel") : t("buttonLabel");
  const stopLabel = noteMode ? t("noteStop") : t("askStop");
  const label = conversing ? t("secretaryEnd") : recording ? stopLabel : idleLabel;

  return (
    <>
      {open && view === "conversation" ? (
        <SecretaryConversation
          question={question}
          // Spoken in, spoken out — then it listens again.
          onSpeak={(text, turn) => void reply(text, turn)}
          onClose={closeConversation}
          state={
            recording
              ? { kind: "listening", level: recorder.level }
              : toast?.kind === "hearing"
                ? { kind: "hearing" }
                : speaking
                  ? { kind: "speaking" }
                  : { kind: "ready" }
          }
          notice={
            toast?.kind === "unheard"
              ? t("askUnheard")
              : toast?.kind === "no_speech"
                ? t("askNothingHeard")
                : recorder.error
                  ? t(`noteError_${recorder.error}`)
                  : null
          }
        />
      ) : open ? (
        <AssistantPanel onClose={() => setOpen(false)} canScan={canScan} mode={mode} onModeChange={setMode} />
      ) : null}

      {/* What the button is doing, said in words above it — inside the
          conversation the window itself says it. */}
      {(recording || toast || recorder.error) && !(open && view === "conversation") ? (
        <div
          role="status"
          className="bg-popover text-popover-foreground shadow-popover fixed right-4 bottom-20 z-[60] flex w-[min(320px,calc(100vw-2rem))] flex-col gap-2 rounded-2xl p-3 text-sm md:bottom-[4.5rem]"
        >
          {recording ? (
            <>
              <span>
                {mode === "note_toggle" ? t("noteRecording") : mode === "note_vad" ? t("noteListening") : t("askListening")} ·{" "}
                {mmss(recorder.seconds)}
              </span>
              <span className="bg-ground h-1.5 w-full overflow-hidden rounded-full" role="presentation">
                <span
                  className="bg-destructive block h-full rounded-full transition-[width] duration-100"
                  style={{ width: `${Math.round(recorder.level * 100)}%` }}
                />
              </span>
              <button
                type="button"
                onClick={() => recorder.cancel()}
                className="text-ink-2 hover:text-ink self-start text-xs underline"
              >
                {t("noteCancel")}
              </button>
            </>
          ) : toast?.kind === "saving" ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("noteSaving")}
            </span>
          ) : toast?.kind === "saved" ? (
            <span className="flex items-center gap-2">
              {t("noteSaved")}
              <Link href={`/calls/${toast.id}`} className="text-brand-ink ml-auto underline underline-offset-2">
                {t("noteOpen")}
              </Link>
            </span>
          ) : toast?.kind === "failed" ? (
            <>
              <span className="text-destructive" role="alert">
                {t("noteFailed")}
              </span>
              <span className="flex gap-3 text-xs">
                <button type="button" onClick={() => void save(toast.blob)} className="text-brand-ink underline">
                  {t("noteRetry")}
                </button>
                <button type="button" onClick={() => setToast(null)} className="text-ink-2 underline">
                  {t("noteDiscard")}
                </button>
              </span>
            </>
          ) : toast?.kind === "hearing" ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("askHearing")}
            </span>
          ) : toast?.kind === "unheard" ? (
            <>
              <span className="text-destructive" role="alert">
                {t("askUnheard")}
              </span>
              <span className="flex gap-3 text-xs">
                <button type="button" onClick={() => void ask(toast.blob)} className="text-brand-ink underline">
                  {t("noteRetry")}
                </button>
                <button type="button" onClick={() => setToast(null)} className="text-ink-2 underline">
                  {t("noteDiscard")}
                </button>
              </span>
            </>
          ) : toast?.kind === "no_speech" ? (
            <span>{noteMode ? t("noteNoSpeech") : t("askNothingHeard")}</span>
          ) : recorder.error ? (
            <span className="text-destructive" role="alert">
              {t(`noteError_${recorder.error}`)}
            </span>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void press()}
        onPointerDown={pointerDown}
        onPointerUp={pointerUp}
        onPointerLeave={pointerUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-expanded={voiceMode ? undefined : open}
        aria-pressed={voiceMode ? recording : undefined}
        aria-label={label}
        className={cn(
          // Above the panel (z-50) in secretary mode: a follow-up is one more press.
          "shadow-popover fixed right-4 bottom-4 z-[60] flex items-center justify-center rounded-full transition-transform select-none active:scale-95",
          // A live mic pulses rather than turning red: red stays for genuine alarm.
          // Ending the conversation is dark, not red, for the same reason.
          conversing ? "bg-ink text-surface" : "bg-brand text-on-brand",
          recording && !conversing && "ring-brand/40 animate-pulse ring-4",
          // Phone: a round button. Desktop: a pill that says what it is.
          "size-14 md:h-11 md:w-auto md:gap-2 md:px-4",
          open && view === "full" && "max-md:hidden",
        )}
      >
        <Icon className={cn("size-5 md:size-4", recording && "fill-current")} aria-hidden />
        <span className="hidden text-sm font-medium md:inline">{label}</span>
        <kbd className="hidden font-sans text-xs font-normal md:inline">{conversing ? "Esc" : shortcut}</kbd>
      </button>
    </>
  );
}

/** Tell the server why a spoken request went nowhere (migration 127); never throws. */
function report(stage: NoteFailureStage, detail: string | null, extra: Record<string, unknown>) {
  void reportNoteFailure(stage, detail, {
    ...extra,
    path: window.location.pathname,
    online: navigator.onLine,
    userAgent: navigator.userAgent,
  }).catch(() => {});
}

/**
 * A short tone and a buzz — the only feedback a driver gets that the mic is
 * live. Best-effort (some browsers refuse audio or vibration).
 */
function cue(kind: "start") {
  try {
    navigator.vibrate?.(60);
  } catch {
    /* not supported */
  }
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(kind === "start" ? 660 : 880, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => void ctx.close();
  } catch {
    /* no audio */
  }
}
