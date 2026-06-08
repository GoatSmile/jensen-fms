import { cn } from "@/lib/utils";

/**
 * Bordered card with a title/description header and an optional right-aligned
 * action. The single shared version of the `Section` that used to be
 * copy-pasted across detail and form pages. Header degrades to a left-aligned
 * title when there's no action; `contentClassName` lets form sections add the
 * inter-field gap (e.g. "flex flex-col gap-3").
 */
export function Section({
  title,
  description,
  action,
  contentClassName,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="text-muted-foreground text-xs">{description}</p>
          ) : null}
        </div>
        {action ?? null}
      </header>
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}
