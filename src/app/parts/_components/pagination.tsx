import Link from "next/link";

import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  pageCount: number;
  totalCount: number;
  pageSize: number;
  /**
   * If provided, used to construct prev/next links. Defaults to "/parts" — the
   * only place this component is used today, but kept overrideable so we don't
   * have to fork the component when we add the same pattern elsewhere.
   */
  basePath?: string;
};

/**
 * Server component pagination. We can't read the current URL search-params
 * here (Next.js doesn't pass them through), so we re-stamp prev/next as plain
 * `?page=N` links. The PartsFilters client component preserves the rest of
 * the query string when filters change, and clicking page links is rare
 * enough that a cleaner URL is the right tradeoff.
 *
 * If we later need to preserve filters across page clicks, lift this into a
 * client component or thread `searchParams` through from the page.
 */
export function PartsPagination({
  page,
  pageCount,
  totalCount,
  pageSize,
  basePath = "/parts",
}: Props) {
  if (totalCount === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  const hasPrev = page > 1;
  const hasNext = page < pageCount;

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
            <Link href={`${basePath}?page=${page - 1}`}>Previous</Link>
          ) : (
            <span>Previous</span>
          )}
        </Button>
        <Button variant="outline" size="sm" disabled={!hasNext} asChild={hasNext}>
          {hasNext ? (
            <Link href={`${basePath}?page=${page + 1}`}>Next</Link>
          ) : (
            <span>Next</span>
          )}
        </Button>
      </div>
    </div>
  );
}
