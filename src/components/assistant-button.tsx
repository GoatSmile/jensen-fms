"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Mic, Sparkles, Square } from "lucide-react";

import { mintNoteUpload, saveSpokenNote } from "@/app/_actions/notes";
import { NOTE_SILENCE_STOP, useRecorder } from "@/lib/dictation/use-recorder";
import { contextFromPath } from "@/lib/notes/context";
import { isNoteMode, type AssistantMode } from "@/lib/notes/mode";
import { cn } from "@/lib/utils";

import { AssistantPanel } from "./assistant-panel";

/** Holding the button this long opens the panel, whatever the mode. */
const LONG_PRESS_MS = 500;
/** How long "Saved" stays up. */
const TOAST_MS = 4000;

type Toast =
  | { kind: "saving" }
  | { kind: "saved"; id: string }
  | { kind: "failed"; blob: Blob }
  | { kind: "no_speech" };

/**
 * The ONE floating button (owner, 2026-10-01: "all one button, and if
 * somebody wants to use the camera, they can do it") — bottom right on every
 * screen, phone and desktop alike. ⌘K / Ctrl+K opens the panel from the
 * keyboard, and so does holding the button, in every mode.
 *
 * What a PRESS does is the person's choice (`people.assistant_mode`,
 * plan-inbox-notes.md): open the panel (`ask`), or record a spoken NOTE —
 * pressed again to save (`note_toggle`) or saved by itself on a pause
 * (`note_vad`). A note is saved before it is transcribed, with a beep and a
 * buzz at start and save, so it works without looking at the screen: in the
 * car that is the whole point. In note modes the icon is a microphone — the
 * panel's own Dictate mic is not on screen while it records.
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
  const [shortcut, setShortcut] = useState("Ctrl K");
  const [toast, setToast] = useState<Toast | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const noteMode = isNoteMode(mode);

  const hidden =
    pathname === "/login" ||
    pathname === "/scan" ||
    pathname.startsWith("/b/") ||
    pathname.startsWith("/report") ||
    // The work-order workspace keeps the bottom edge for its action bar.
    /^\/work\/(?!paint-runs|deliveries)[^/]+/.test(pathname) ||
    // The customer map is full-bleed Leaflet; the button would sit on its controls.
    pathname === "/organizations/map";

  const save = useCallback(
    async (blob: Blob) => {
      setToast({ kind: "saving" });
      try {
        const minted = await mintNoteUpload();
        if (!minted.ok) throw new Error(minted.error);
        const put = await fetch(minted.signedUrl, {
          method: "PUT",
          headers: { "content-type": "audio/wav" },
          body: blob,
        });
        if (!put.ok) throw new Error(`upload ${put.status}`);
        const r = await saveSpokenNote(minted.path, contextFromPath(window.location.pathname, locale));
        if (!r.ok) throw new Error(r.error);
        cue("saved");
        setToast({ kind: "saved", id: r.id });
      } catch (e) {
        // The recording is still here — Retry, never "say it again". The
        // reason goes to the console: a failure nobody can read is unfixable.
        console.error("[note] save failed:", e);
        setToast({ kind: "failed", blob });
      }
    },
    [locale],
  );

  const recorder = useRecorder({
    onCaptured: (blob) => void save(blob),
    silenceStop: mode === "note_vad" ? NOTE_SILENCE_STOP : undefined,
    onNoSpeech: () => setToast({ kind: "no_speech" }),
  });
  const recording = recorder.phase === "recording";

  useEffect(() => {
    if (toast?.kind !== "saved" && toast?.kind !== "no_speech") return;
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
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A navigation (an Open, a choice) closes the panel.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the route
    setOpen(false);
  }, [pathname]);

  async function press() {
    if (longPressed.current) return;
    if (!noteMode) return setOpen((o) => !o);
    if (recording) return recorder.stop();
    if (toast?.kind === "saving") return;
    setToast(null);
    cue("start");
    await recorder.start();
  }

  function pointerDown() {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      if (recording) recorder.cancel();
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
  const Icon = recording ? Square : noteMode ? Mic : Sparkles;

  return (
    <>
      {open ? (
        <AssistantPanel onClose={() => setOpen(false)} canScan={canScan} mode={mode} onModeChange={setMode} />
      ) : null}

      {/* What the button is doing, said in words above it: recording, saved,
          or the one failure that must not lose anything. */}
      {recording || toast || recorder.error ? (
        <div
          role="status"
          className="bg-popover text-popover-foreground shadow-popover fixed right-4 bottom-20 z-40 flex w-[min(320px,calc(100vw-2rem))] flex-col gap-2 rounded-2xl p-3 text-sm md:bottom-[4.5rem]"
        >
          {recording ? (
            <>
              <span>
                {mode === "note_vad" ? t("noteListening") : t("noteRecording")} · {mmss(recorder.seconds)}
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
          ) : toast?.kind === "no_speech" ? (
            <span>{t("noteNoSpeech")}</span>
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
        aria-expanded={noteMode ? undefined : open}
        aria-pressed={noteMode ? recording : undefined}
        aria-label={noteMode ? (recording ? t("noteStop") : t("noteButtonLabel")) : t("buttonLabel")}
        className={cn(
          "shadow-popover fixed right-4 bottom-4 z-40 flex items-center justify-center rounded-full transition-transform select-none active:scale-95",
          // A live mic pulses rather than turning red: red stays for genuine alarm.
          "bg-brand text-on-brand",
          recording && "ring-brand/40 animate-pulse ring-4",
          // Phone: a round button where Scan used to sit. Desktop: a pill that says what it is.
          "size-14 md:h-11 md:w-auto md:gap-2 md:px-4",
          open && "max-md:hidden",
        )}
      >
        <Icon className={cn("size-5 md:size-4", recording && "fill-current")} aria-hidden />
        <span className="hidden text-sm font-medium md:inline">
          {noteMode ? (recording ? t("noteStop") : t("noteButtonLabel")) : t("buttonLabel")}
        </span>
        <kbd className="hidden font-sans text-xs font-normal md:inline">{shortcut}</kbd>
      </button>
    </>
  );
}

/**
 * A short tone and a buzz — the only feedback a driver gets. Start rises,
 * saved falls; best-effort (some browsers refuse audio or vibration).
 */
function cue(kind: "start" | "saved") {
  try {
    navigator.vibrate?.(kind === "start" ? 60 : [40, 60, 40]);
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
    osc.frequency.linearRampToValueAtTime(kind === "start" ? 880 : 520, ctx.currentTime + 0.15);
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
