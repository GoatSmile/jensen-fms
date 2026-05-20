import { cn } from "@/lib/utils";

type Props = {
  rows?: number;
  cols?: number;
  className?: string;
};

/**
 * Generic shimmer placeholder for list pages while server data loads.
 * Sized to roughly match the existing list-page tables.
 */
export function TableSkeleton({ rows = 8, cols = 5, className }: Props) {
  return (
    <div className={cn("overflow-hidden rounded-md border", className)}>
      <div className="bg-muted/40 flex h-10 items-center gap-4 border-b px-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="bg-muted h-3 flex-1 animate-pulse rounded" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex h-12 items-center gap-4 border-b px-4 last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="bg-muted/70 h-3 flex-1 animate-pulse rounded"
              style={{ animationDelay: `${(r * cols + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
