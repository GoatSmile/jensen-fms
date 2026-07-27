"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Printer, ScanLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
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
  const t = useTranslations("batchBuild");
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
      identifiers: identifierTypes.map((idType) => ({
        typeId: idType.id,
        value: ids[b.id]?.[idType.id] ?? "",
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
      <Panel contentClassName="flex flex-wrap items-center gap-3">
        <label htmlFor="batch-count" className="text-sm font-medium">
          {t("howMany")}
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
          {t("ofUnbuilt", { count: bikes.length })}
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
                {p === bikes.length ? t("allPreset", { count: p }) : p}
              </button>
            ))}
          </div>
        ) : null}
        <a
          href={`/manufacturing-orders/${moId}/pick-list/print?n=${n}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1.5 text-xs underline underline-offset-4"
        >
          <Printer aria-hidden className="size-3.5" />{" "}
          {t("printPickList", { count: n })}
        </a>
      </Panel>

      {/* Raw <table>, not the shadcn primitive — it carries per-row inputs and
          the scan handlers. So the scroller has to live on the panel body,
          where the primitive would have brought its own. */}
      <Panel contentClassName="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="text-muted-foreground w-8 px-3 py-2 text-xs font-medium">
                #
              </th>
              <th className="px-3 py-2 font-medium">
                {t("frameHeader")} <span className="text-destructive">*</span>
              </th>
              {identifierTypes.map((idType) => (
                <th key={idType.id} className="px-3 py-2 font-medium">
                  {idType.name}
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
                      {t("atPainterBadge")}
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
                        aria-label={t("frameAria", { index: i + 1 })}
                        className="h-8 w-56 pl-8 font-mono text-xs"
                      />
                    </div>
                  )}
                </td>
                {identifierTypes.map((idType) => (
                  <td key={idType.id} className="px-3 py-1.5">
                    <Input
                      value={ids[b.id]?.[idType.id] ?? ""}
                      onChange={(e) =>
                        setIds((p) => ({
                          ...p,
                          [b.id]: {
                            ...(p[b.id] ?? {}),
                            [idType.id]: e.target.value,
                          },
                        }))
                      }
                      disabled={pending || b.atPainter}
                      aria-label={t("idAria", { type: idType.name, index: i + 1 })}
                      className="h-8 w-40 text-xs"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {summary ? (
        <Panel contentClassName="flex flex-col gap-1.5 text-sm">
          <p>
            <span className="font-medium text-good">
              {t("builtSummary", { count: summary.built })}
            </span>
            {summary.skipped > 0 ? (
              <span className="text-muted-foreground">
                {t("skippedSummary", { count: summary.skipped })}
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
            {t("backTo", { mo: moNumber })}
          </Link>
        </Panel>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ScanLine aria-hidden className="size-3.5" />
          {t("footerHint")}
        </p>
        <Button
          type="button"
          size="lg"
          onClick={onBuild}
          disabled={pending || readyCount === 0}
        >
          {pending ? t("building") : t("buildN", { count: readyCount })}
        </Button>
      </footer>
    </div>
  );
}
