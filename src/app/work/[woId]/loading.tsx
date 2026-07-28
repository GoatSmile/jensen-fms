/**
 * Loading skeleton for the per-WO technician workspace — mirrors the real
 * layout (sticky header card + stacked note/parts/photo sections) so the
 * jump from the queue on shop-floor wifi shows structure immediately.
 *
 * Borderless on purpose: the real sections are `Panel`s, so a bordered
 * skeleton would flash a box that then dissolves on every navigation (the
 * lesson `TableSkeleton` taught — CLAUDE.md).
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 pb-24 sm:p-6 sm:pb-28">
      <div className="bg-muted h-8 w-28 animate-pulse rounded" />
      <div className="bg-muted/60 h-36 animate-pulse rounded-lg" />
      <div className="bg-muted/50 h-32 animate-pulse rounded-lg" />
      <div className="bg-muted/50 h-28 animate-pulse rounded-lg" />
      <div className="bg-muted/50 h-24 animate-pulse rounded-lg" />
    </div>
  );
}
