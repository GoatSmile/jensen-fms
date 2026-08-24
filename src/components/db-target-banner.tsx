import { AlertTriangle, Database } from "lucide-react";

/**
 * Which database is this dev server talking to?
 *
 * The app URL is http://localhost:3000 either way, so nothing else on screen
 * answers it — and "I thought I was on local" is how test data reaches the
 * person actually using the system.
 *
 * DEV ONLY: never rendered in a production build, where the question doesn't
 * arise. Within dev, PRODUCTION is the state worth shouting about, so it
 * wears `alert`; local wears `good` and stays quiet.
 *
 * Derived from NEXT_PUBLIC_SUPABASE_URL rather than a flag of its own — a
 * separate flag can be wrong, this one is the connection itself.
 */
export function DbTargetBanner() {
  if (process.env.NODE_ENV !== "development") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url) return null;
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");

  return (
    <div
      className={`fixed bottom-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-popover print:hidden ${
        isLocal ? "bg-good text-on-good" : "bg-alert text-on-alert"
      }`}
      // Not interactive, and it must never sit in front of a control.
      aria-live="polite"
      role="status"
    >
      {isLocal ? (
        <Database aria-hidden className="size-3.5" />
      ) : (
        <AlertTriangle aria-hidden className="size-3.5" />
      )}
      {isLocal ? "Local database" : "PRODUCTION database"}
    </div>
  );
}
