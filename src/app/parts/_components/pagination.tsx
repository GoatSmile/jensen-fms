import Link from "next/link";

import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  pageCount: number;
  totalCount: number;
  pageSize: number;
  /** Current URL searchParams — used so prev/next preserve filters/sort. */
  searchParams: Record<string, string | string[] | undefined>;
  /** Defaults to /parts. */
  basePath?: string;
};

/**
 * Server component pagination. The page passes `searchParams` through so
 * prev/next links carry every active filter and the sort param along.
 */
export function PartsPagination({
  page,
  pageCount,
  totalCount,
  pageSize,
  searchParams,
  basePath = "/parts",
}: Props) {
  if (totalCount === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  const hasPrev = page > 1;
  const hasNext = page < pageCount;

  function buildHref(targetPage: number): string {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v == null) continue;
      if (k === "page") continue;
      if (Array.isArray(v)) {
        for (const item of v) next.append(k, item);
      } else {
        next.set(k, v);
      }
    }
    next.set("page", String(targetPage));
    return `${basePath}?${next.toString()}`;
  }

  return (
    <div className="flex items-center justify-between text-sm">
      <p className="text-muted-foreground">
        Showing <span className="text-foreground font-medium">{start}</span>–
        <span className="text-foreground font-medium">{end}</span> of{" "}
        <span className="text-foreground font-medium">{totalCount}</span>
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={!hasPrev} asChild={hasPrev}>
          {hasPrev ? (
            <Link href={buildHref(page - 1)}>Previous</Link>
          ) : (
            <span>Previous</span>
          )}
        </Button>
        <Button variant="outline" size="sm" disabled={!hasNext} asChild={hasNext}>
          {hasNext ? (
            <Link href={buildHref(page + 1)}>Next</Link>
          ) : (
            <span>Next</span>
          )}
        </Button>
      </div>
    </div>
  );
}
