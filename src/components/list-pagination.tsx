import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  pageCount: number;
  totalCount: number;
  pageSize: number;
  /** Current URL searchParams — used so prev/next preserve filters/sort. */
  searchParams: Record<string, string | string[] | undefined>;
  /** The list's path, WITHOUT a query — the query comes from `searchParams`. */
  basePath: string;
};

/**
 * A list's prev/next pagination — server component, shared by every paged
 * list (parts, bikes). The page passes `searchParams` through, so the links
 * carry every active filter, the view and the sort along.
 */
export async function ListPagination({
  page,
  pageCount,
  totalCount,
  pageSize,
  searchParams,
  basePath,
}: Props) {
  if (totalCount === 0) return null;
  const t = await getTranslations("common");

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
        {t.rich("paginationShowing", {
          b: (chunks) => (
            <span className="text-foreground font-medium">{chunks}</span>
          ),
          start,
          end,
          total: totalCount,
        })}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={!hasPrev} asChild={hasPrev}>
          {hasPrev ? (
            <Link href={buildHref(page - 1)}>{t("paginationPrevious")}</Link>
          ) : (
            <span>{t("paginationPrevious")}</span>
          )}
        </Button>
        <Button variant="outline" size="sm" disabled={!hasNext} asChild={hasNext}>
          {hasNext ? (
            <Link href={buildHref(page + 1)}>{t("paginationNext")}</Link>
          ) : (
            <span>{t("paginationNext")}</span>
          )}
        </Button>
      </div>
    </div>
  );
}
