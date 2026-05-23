"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CameraOff, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { findBikeByFrameNumber } from "../_actions/find-bike";

/**
 * Customer-facing entry point. Three routes in, all anonymous:
 *
 *   1. "Scan QR code" (primary) — opens the camera, decoded sticker URL
 *      → /b/<bike-id>.
 *   2. Type the frame number (secondary) — server action looks it up
 *      → /b/<bike-id>.
 *   3. "I don't know my bike" (tertiary) → /report/help — free-form
 *      contact form, ticket lands with bike_id = NULL for staff to triage.
 *
 * Scan is primary because the QR sticker is right there on the bike and
 * one tap is friendlier than typing a frame number on a phone keyboard.
 * Manual entry stays available as a fallback for damaged stickers.
 */
export function ReportEntry() {
  const [mode, setMode] = useState<"start" | "camera">("start");

  return (
    <div className="flex flex-col gap-5">
      {mode === "camera" ? (
        <CameraScan onCancel={() => setMode("start")} />
      ) : (
        <PrimaryStart onScanClick={() => setMode("camera")} />
      )}
    </div>
  );
}

function PrimaryStart({ onScanClick }: { onScanClick: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="lg"
          onClick={onScanClick}
          className="h-14 text-base"
        >
          <ScanLine className="mr-2 size-5" aria-hidden />
          Scan QR code on your bike
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          Point your phone at the QR sticker on the bike frame.
        </p>
      </div>

      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <div className="flex-1 border-t" />
        <span>or</span>
        <div className="flex-1 border-t" />
      </div>

      <ManualEntry />

      <div className="text-muted-foreground border-t pt-4 text-center text-xs">
        <Link
          href="/report/help"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          Don&rsquo;t know which bike? Send us a message →
        </Link>
      </div>
    </div>
  );
}

function ManualEntry() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const v = value.trim();
    if (!v) {
      setError("Please enter the frame number.");
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-frame" className="text-sm">
          Or enter the frame number
        </Label>
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
        />
        <p className="text-muted-foreground text-xs">
          Printed on a label or stamped near the bottom bracket.
        </p>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        variant="outline"
        disabled={pending || !value.trim()}
      >
        {pending ? "Looking up…" : "Continue"}
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
     * Customer-side routing: every code path ends at /b/<id>. The QR
     * stickers we print encode /b/<id> on our own origin, so the common
     * case is a same-origin redirect.
     */
    function handleDecoded(value: string) {
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
        } else {
          setStatus({
            kind: "error",
            message:
              "That QR code doesn't look like a Jensen sticker. Try again or enter the frame number.",
          });
          return;
        }
      } catch {
        /* not a URL — fall through */
      }
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        )
      ) {
        router.push(`/b/${value}`);
        return;
      }
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
            sticker
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
