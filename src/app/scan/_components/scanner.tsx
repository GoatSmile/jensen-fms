"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CameraOff, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

/**
 * QR scanner using html5-qrcode. Opens the back camera, listens for QR
 * payloads, and routes on the first successful decode.
 *
 * Routing logic:
 *   - If the decoded value parses as a URL on our own origin, the router
 *     navigates to that path (so /b/<id> stickers land staff in the right
 *     bike, and future sticker types Just Work).
 *   - If the decoded value is a UUID, treat it as a bike id and go to
 *     /bikes/<id>.
 *   - Otherwise, surface the raw decoded text so the user can decide.
 *
 * Permissions: first call triggers the browser camera prompt. Subsequent
 * mounts reuse the granted permission unless the user revokes it.
 */
export function Scanner() {
  const router = useRouter();
  const t = useTranslations("scan");
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<unknown>(null); // Html5Qrcode instance
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "starting" }
    | { kind: "scanning" }
    | { kind: "error"; message: string }
    | { kind: "decoded"; value: string }
  >({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setStatus({ kind: "starting" });
      try {
        // Dynamic import so the html5-qrcode bundle (~80 KB) is only
        // pulled in when the scan page mounts.
        const mod = await import("html5-qrcode");
        if (cancelled) return;
        const elem = containerRef.current;
        if (!elem) return;
        // Give the container a stable id html5-qrcode can attach to.
        if (!elem.id) elem.id = "qr-scanner";
        const scanner = new mod.Html5Qrcode(elem.id, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (vw: number, vh: number) => {
              const size = Math.floor(Math.min(vw, vh) * 0.7);
              return { width: size, height: size };
            },
          },
          (decodedText: string) => {
            if (cancelled) return;
            setStatus({ kind: "decoded", value: decodedText });
            // Stop the camera before navigating away.
            scanner.stop().catch(() => {});
            handleDecoded(decodedText);
          },
          () => {
            /* per-frame failures are noisy; ignore. */
          },
        );
        if (!cancelled) setStatus({ kind: "scanning" });
      } catch (err) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message:
            err instanceof Error ? err.message : t("cameraDefaultError"),
        });
      }
    }

    function handleDecoded(value: string) {
      // URL on our origin → use its path; otherwise fall back to bike-id.
      try {
        const u = new URL(value, window.location.origin);
        if (u.origin === window.location.origin) {
          // Stickers encode the public /b/<id> page (for customers). The
          // in-app scanner is only used by staff, so rewrite to the workshop
          // view /bikes/<id> instead of making them tap through the public
          // landing.
          const stickerMatch = u.pathname.match(
            /^\/b\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
          );
          if (stickerMatch) {
            router.push(`/bikes/${stickerMatch[1]}`);
            return;
          }
          router.push(u.pathname + u.search);
          return;
        }
        // External URL — still navigate; the scanned sticker wins.
        window.location.href = value;
        return;
      } catch {
        /* not a URL */
      }
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        router.push(`/bikes/${value}`);
        return;
      }
      // Show it to the user so they can act on it manually.
      setStatus({ kind: "decoded", value });
    }

    start();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current as
        | { stop: () => Promise<void>; clear: () => void }
        | undefined;
      if (scanner) {
        // `stop()` throws SYNCHRONOUSLY when the scanner was constructed but
        // never started — which is exactly what happens when the camera
        // permission was denied. The `.catch()` below can only handle a REJECTED
        // promise, so without this try the throw escaped the cleanup and Next
        // showed "Cannot stop, scanner is not running or paused" on navigating
        // away from /scan. Reachable by any mechanic who declines the camera
        // prompt and then leaves the page (found 2026-07-29).
        const clear = () => {
          try {
            scanner.clear();
          } catch {
            /* nothing to clean */
          }
        };
        try {
          scanner.stop().catch(() => {}).finally(clear);
        } catch {
          clear();
        }
      }
    };
  }, [router, t]);

  return (
    <div className="flex flex-col gap-4">
      {/* Media frame, not card soup: the border defines the camera feed's edge,
          the same exemption photo thumbnails get. Not a Panel — a Panel's padding
          and fill are wrong around a bleed-to-edge video surface. */}
      <div className="border-rule relative overflow-hidden rounded-lg border bg-black">
        <div ref={containerRef} className="aspect-square w-full" />
        {status.kind === "starting" ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            {t("openingCamera")}
          </div>
        ) : null}
        {status.kind === "scanning" ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            <ScanLine className="size-3.5" aria-hidden /> {t("pointAtSticker")}
          </div>
        ) : null}
      </div>

      {/* Untinted, with the destructive colour carried by the icon and title
          rather than a red wash: manual entry below is a working fallback, so this
          is a failed attempt, not an alarm — and CLAUDE.md keeps `alert` scarce so
          that red still means something when it appears. */}
      {status.kind === "error" ? (
        <Panel contentClassName="flex items-start gap-2 text-sm">
          <CameraOff
            className="text-destructive mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <p className="text-destructive font-medium">
              {t("cameraFailedTitle")}
            </p>
            <p className="text-ink-2 text-xs">
              {t("cameraFailedBody", { message: status.message })}
            </p>
          </div>
        </Panel>
      ) : null}

      {status.kind === "decoded" ? (
        <Panel contentClassName="text-sm">
          <p className="font-medium">{t("scannedLabel")}</p>
          <p className="text-ink-2 font-mono text-xs break-all">
            {status.value}
          </p>
        </Panel>
      ) : null}

      <ManualEntry />
    </div>
  );
}

function ManualEntry() {
  const router = useRouter();
  const t = useTranslations("scan");
  const [value, setValue] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    // Accept a full URL, a UUID, or a frame number.
    //
    // The URL branch is gated on the input actually LOOKING like a URL. It used
    // to be a bare `try { new URL(v, origin) }`, and that never throws for a
    // plain string — a relative reference resolves against the origin — so
    // "JP-2026-E_BIKE-034" became `/JP-2026-E_BIKE-034` and pushed a 404. The
    // catch below only ever fired for genuinely malformed input, which made the
    // frame-number fallback at the bottom unreachable: typing a frame number
    // into the manual fallback, the thing you use when the camera won't start,
    // always 404'd. Found 2026-07-29 while browser-verifying this file.
    const looksLikeUrl = /^https?:\/\//i.test(v) || v.startsWith("/");
    if (looksLikeUrl) {
      try {
        const u = new URL(v, window.location.origin);
        if (u.origin === window.location.origin) {
          // Same rewrite as the camera path: /b/<id> stickers are for
          // customers; staff want the workshop view.
          const stickerMatch = u.pathname.match(
            /^\/b\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
          );
          if (stickerMatch) {
            router.push(`/bikes/${stickerMatch[1]}`);
            return;
          }
          router.push(u.pathname + u.search);
          return;
        }
      } catch {
        /* not a usable URL — fall through to identifier handling */
      }
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      router.push(`/bikes/${v}`);
      return;
    }
    // Treat as a frame number search.
    router.push(`/bikes?q=${encodeURIComponent(v)}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1.5">
      <label className="text-muted-foreground text-xs" htmlFor="manual-entry">
        {t("manualLabel")}
      </label>
      <div className="flex gap-2">
        <input
          id="manual-entry"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm font-mono"
          placeholder={t("manualPlaceholder")}
        />
        <Button type="submit" disabled={!value.trim()}>
          {t("go")}
        </Button>
      </div>
    </form>
  );
}
