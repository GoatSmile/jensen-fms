"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Share, X } from "lucide-react";

/**
 * Helper banner shown on the /scan page when the user is in mobile
 * Safari (or any other "browser tab" context). iOS Safari does not
 * persist getUserMedia permission across tab loads — every visit
 * re-prompts. Once the user adds the app to their home screen, iOS
 * treats it like an installed app and the permission persists.
 *
 * The banner is dismissable (per-device, via localStorage). It only
 * renders client-side: PWA-installed clients (display-mode: standalone)
 * see nothing, and SSR returns null to avoid a flash.
 */
const DISMISS_KEY = "scan-install-hint-dismissed";

export function InstallHint() {
  const t = useTranslations("scan");
  const [state, setState] = useState<
    | { kind: "hidden" }
    | { kind: "ios" }
    | { kind: "android" }
  >({ kind: "hidden" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Already installed as a PWA — no prompt to dodge.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari predates the spec and exposes navigator.standalone
      (window.navigator as Navigator & { standalone?: boolean })
        .standalone === true;
    if (standalone) return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    const ua = window.navigator.userAgent.toLowerCase();
    const isIos =
      /iphone|ipad|ipod/.test(ua) ||
      // iPadOS 13+ identifies as Mac; fall back to touch detection.
      (ua.includes("mac") && "ontouchend" in document);
    if (isIos) {
      setState({ kind: "ios" });
      return;
    }
    if (ua.includes("android")) {
      setState({ kind: "android" });
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode etc. — just hide this session */
    }
    setState({ kind: "hidden" });
  }

  if (state.kind === "hidden") return null;

  return (
    <div className="relative rounded-md border bg-muted/30 p-3 pr-8 text-xs">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("installDismiss")}
        className="hover:bg-muted absolute right-1.5 top-1.5 rounded p-1"
      >
        <X className="size-3.5" aria-hidden />
      </button>
      {state.kind === "ios" ? (
        <p>
          {t.rich("installIos", {
            b: (chunks) => <strong>{chunks}</strong>,
            i: (chunks) => <em>{chunks}</em>,
            share: () => (
              <Share className="mx-0.5 inline size-3.5" aria-hidden />
            ),
          })}
        </p>
      ) : (
        <p>
          {t.rich("installAndroid", {
            b: (chunks) => <strong>{chunks}</strong>,
            i: (chunks) => <em>{chunks}</em>,
          })}
        </p>
      )}
    </div>
  );
}
