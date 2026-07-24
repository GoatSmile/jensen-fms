/**
 * Loading skeleton for the workshop-floor queue. The office lists ship one;
 * this force-dynamic touch surface is the most exposed to flaky shop-floor
 * wifi, so it needs feedback on navigation (else a tech double-taps a card
 * that hasn't loaded yet).
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="bg-muted h-7 w-40 animate-pulse rounded" />
      <div className="bg-muted/60 h-9 w-full animate-pulse rounded-md" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-muted/50 h-24 animate-pulse rounded-lg border"
          />
        ))}
      </div>
    </div>
  );
}
