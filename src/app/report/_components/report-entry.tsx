"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CameraOff, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { findBikeByFrameNumber } from "../_actions/find-bike";

/**
 * Customer-facing entry point. Two routes in, both end at /b/<bike-id>:
 *
 *   1. Type the frame number → server action looks it up → navigate.
 *   2. Tap "Scan QR code" → camera opens → decoded sticker URL → navigate.
 *
 * Same anonymous-public posture as /b/* — no auth.
 */
export function ReportEntry() {
  const [mode, setMode] = useState<"input" | "camera">("input");

  return (
    <div className="flex flex-col gap-4">
      {mode === "input" ? (
        <ManualEntry onScanClick={() => setMode("camera")} />
      ) : (
        <CameraScan onCancel={() => setMode("input")} />
      )}
    </div>
  );
}

function ManualEntry({ onScanClick }: { onScanClick: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const v = value.trim();
    if (!v) {
      setError("Please enter your bike's frame number.");
      return;
    }
    start(async () => {
      const r = await findBikeByFrameNumber(v);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/b/${r.bikeId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-frame">Frame number</Label>
        <Input
          id="report-frame"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. JP-2026-E_BIKE-001"
          className="font-mono"
          autoComplete="off"
          autoCapitalize="characters"
          autoFocus
        />
        <p className="text-muted-foreground text-xs">
          The frame number is printed on a label or stamped into the frame,
          usually near the bottom bracket.
        </p>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending || !value.trim()}>
        {pending ? "Looking up…" : "Continue"}
      </Button>

      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <div className="flex-1 border-t" />
        <span>or</span>
        <div className="flex-1 border-t" />
      </div>

      <Button type="button" variant="outline" onClick={onScanClick}>
        <ScanLine className="mr-1 size-4" aria-hidden />
        Scan QR code with camera
      </Button>
    </form>
  );
}

function CameraScan({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<unknown>(null);
  const [status, setStatus] = useState<
    | { kind: "starting" }
    | { kind: "scanning" }
    | { kind: "error"; message: string }
  >({ kind: "starting" });

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const mod = await import("html5-qrcode");
        if (cancelled) return;
        const elem = containerRef.current;
        if (!elem) return;
        if (!elem.id) elem.id = "report-qr-scanner";
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
            scanner.stop().catch(() => {});
            handleDecoded(decodedText);
          },
          () => {
            /* per-frame failures ignored */
          },
        );
        if (!cancelled) setStatus({ kind: "scanning" });
      } catch (err) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Could not start the camera.",
        });
      }
    }

    /**
     * Customer-side routing: every code path ends at /b/<id> (the public
     * report form). The QR stickers we print encode the /b/<id> URL on
     * our own origin, so the common case is just a same-origin redirect.
     */
    function handleDecoded(value: string) {
      // Same-origin /b/<uuid> sticker → navigate to the same path.
      try {
        const u = new URL(value, window.location.origin);
        if (u.origin === window.location.origin) {
          const m = u.pathname.match(
            /^\/b\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
          );
          if (m) {
            router.push(`/b/${m[1]}`);
            return;
          }
          // Same origin but unknown path — fall through to error state.
        } else {
          // Different origin — the QR isn't one of ours. Surface a
          // friendly error and let them try again.
          setStatus({
            kind: "error",
            message:
              "That QR code doesn't look like a Jensen sticker. Try again or type the frame number.",
          });
          return;
        }
      } catch {
        /* not a URL — fall through */
      }
      // Bare UUID — treat as bike id.
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        )
      ) {
        router.push(`/b/${value}`);
        return;
      }
      // Looks like a frame number — resolve via server action then navigate.
      findBikeByFrameNumber(value).then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setStatus({ kind: "error", message: r.error });
          return;
        }
        router.push(`/b/${r.bikeId}`);
      });
    }

    start();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current as
        | { stop: () => Promise<void>; clear: () => void }
        | undefined;
      if (scanner) {
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              scanner.clear();
            } catch {
              /* nothing to clean */
            }
          });
      }
    };
  }, [router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-lg border bg-black">
        <div ref={containerRef} className="aspect-square w-full" />
        {status.kind === "starting" ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Opening camera…
          </div>
        ) : null}
        {status.kind === "scanning" ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            <ScanLine className="size-3.5" aria-hidden /> Point at the QR
            sticker on your bike
          </div>
        ) : null}
      </div>

      {status.kind === "error" ? (
        <div className="bg-destructive/10 text-destructive border-destructive/30 flex items-start gap-2 rounded-md border p-3 text-sm">
          <CameraOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-medium">{status.message}</p>
            <p className="text-xs">
              You can also enter the frame number by hand.
            </p>
          </div>
        </div>
      ) : null}

      <Button type="button" variant="outline" onClick={onCancel}>
        Enter frame number instead
      </Button>
    </div>
  );
}
