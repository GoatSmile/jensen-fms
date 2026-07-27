import { Panel } from "@/components/ui/panel";

type Props = {
  rows?: number;
  cols?: number;
  className?: string;
};

/**
 * Shimmer placeholder for list pages while server data loads.
 *
 * It sits on a `Panel`, because that is what the list page it stands in for
 * renders. While it was a `rounded-md border` box, every navigation to a
 * migrated list page flashed a bordered table that then dissolved into a
 * borderless one — the skeleton has to track the convention, not the shape
 * the tables used to have.
 */
export function TableSkeleton({ rows = 8, cols = 5, className }: Props) {
  return (
    <Panel className={className}>
      {/* Header rule and row separators mirror what `Table` itself renders. */}
      <div className="flex h-10 items-center gap-4 border-b">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="bg-muted h-3 flex-1 animate-pulse rounded" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex h-12 items-center gap-4 border-b last:border-b-0"
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
    </Panel>
  );
}
