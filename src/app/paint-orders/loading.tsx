import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="bg-muted h-6 w-40 animate-pulse rounded" />
      <TableSkeleton rows={8} cols={8} />
    </div>
  );
}
