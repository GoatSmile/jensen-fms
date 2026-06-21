"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ScanLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bulkBuildBikesWithIds,
  type BatchBuildEntry,
} from "../../_actions/build-batch";

export type BatchBikeRow = {
  id: string;
  provisionalFrame: string;
  frameConfirmed: boolean;
  atPainter: boolean;
};

type IdType = { id: string; name: string };

type Summary = {
  built: number;
  skipped: number;
  errors: { frame: string; error: string }[];
};

export function BatchBuildGrid({
  moId,
  moNumber,
  bikes,
  identifierTypes,
}: {
  moId: string;
  moNumber: string;
  bikes: BatchBikeRow[];
  identifierTypes: IdType[];
}) {
  const router = useRouter();
  const [count, setCount] = useState(bikes.length);
  const [frames, setFrames] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      bikes.map((b) => [b.id, b.frameConfirmed ? b.provisionalFrame : ""]),
    ),
  );
  const [ids, setIds] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pending, start] = useTransition();

  const n = Math.max(1, Math.min(count || 1, bikes.length));
  const active = useMemo(() => bikes.slice(0, n), [bikes, n]);
  const readyCount = active.filter(
    (b) => !b.atPainter && (frames[b.id] ?? "").trim() !== "",
  ).length;

  const presets = useMemo(
    () =>
      [...new Set([2, 5, 10, bikes.length])]
        .filter((x) => x >= 1 && x <= bikes.length)
        .sort((a, b) => a - b),
    [bikes.length],
  );

  function onBuild() {
    setError(null);
    setSummary(null);
    const entries: BatchBuildEntry[] = active.map((b) => ({
      bikeId: b.id,
      frameNumber: frames[b.id] ?? "",
      identifiers: identifierTypes.map((t) => ({
        typeId: t.id,
        value: ids[b.id]?.[t.id] ?? "",
      })),
    }));
    start(async () => {
      const r = await bulkBuildBikesWithIds(moId, entries);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.errors.length === 0 && r.built > 0) {
        router.push(`/manufacturing-orders/${moId}`);
        return;
      }
      setSummary({ built: r.built, skipped: r.skipped, errors: r.errors });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-muted/30 flex flex-wrap items-center gap-3 rounded-md border p-3">
        <label htmlFor="batch-count" className="text-sm font-medium">
          How many are you building now?
        </label>
        <Input
          id="batch-count"
          type="number"
          min={1}
          max={bikes.length}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="h-9 w-20 text-center tabular-nums"
        />
        <span className="text-muted-foreground text-sm">
          of {bikes.length} unbuilt
        </span>
        {presets.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setCount(p)}
                className={`rounded-md border px-2 py-0.5 text-xs ${
                  n === p
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {p === bikes.length ? `all ${p}` : p}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="text-muted-foreground w-8 px-3 py-2 text-xs font-medium">
                #
              </th>
              <th className="px-3 py-2 font-medium">
                Frame no. <span className="text-destructive">*</span>
              </th>
              {identifierTypes.map((t) => (
                <th key={t.id} className="px-3 py-2 font-medium">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((b, i) => (
              <tr key={b.id} className="border-b last:border-0 align-middle">
                <td className="text-muted-foreground px-3 py-1.5 text-xs tabular-nums">
                  {i + 1}
                </td>
                <td className="px-3 py-1.5">
                  {b.atPainter ? (
                    <Badge variant="warning" className="text-[10px]">
                      at painter — receive back first
                    </Badge>
                  ) : (
                    <div className="relative">
                      <ScanLine
                        aria-hidden
                        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                      />
                      <Input
                        value={frames[b.id] ?? ""}
                        onChange={(e) =>
                          setFrames((p) => ({ ...p, [b.id]: e.target.value }))
                        }
                        placeholder={b.provisionalFrame}
                        autoFocus={i === 0}
                        disabled={pending}
                        aria-label={`Frame number for bike ${i + 1}`}
                        className="h-8 w-56 pl-8 font-mono text-xs"
                      />
                    </div>
                  )}
                </td>
                {identifierTypes.map((t) => (
                  <td key={t.id} className="px-3 py-1.5">
                    <Input
                      value={ids[b.id]?.[t.id] ?? ""}
                      onChange={(e) =>
                        setIds((p) => ({
                          ...p,
                          [b.id]: { ...(p[b.id] ?? {}), [t.id]: e.target.value },
                        }))
                      }
                      disabled={pending || b.atPainter}
                      aria-label={`${t.name} for bike ${i + 1}`}
                      className="h-8 w-40 text-xs"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="flex flex-col gap-1.5 rounded-md border p-3 text-sm">
          <p>
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {summary.built} built
            </span>
            {summary.skipped > 0 ? (
              <span className="text-muted-foreground">
                {" "}
                · {summary.skipped} left (no frame entered)
              </span>
            ) : null}
          </p>
          {summary.errors.length > 0 ? (
            <ul className="text-destructive list-inside list-disc">
              {summary.errors.map((e, idx) => (
                <li key={idx}>
                  <span className="font-mono text-xs">{e.frame}</span> — {e.error}
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            href={`/manufacturing-orders/${moId}`}
            className="text-sm underline underline-offset-4"
          >
            Back to {moNumber}
          </Link>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ScanLine aria-hidden className="size-3.5" />
          Enter a frame to build that bike; leave it blank to skip for now. Parts
          come from the recipe.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={onBuild}
          disabled={pending || readyCount === 0}
        >
          {pending
            ? "Building…"
            : `Build ${readyCount} bike${readyCount === 1 ? "" : "s"}`}
        </Button>
      </footer>
    </div>
  );
}
