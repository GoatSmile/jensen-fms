/**
 * Shared section shell for the bike-model detail page. Mirrors the helper used
 * on the part detail page so the visual rhythm stays consistent across the FMS.
 */
type Props = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
};

export function Section({ title, description, action, children }: Props) {
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
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-20 items-center justify-center text-sm">
      {children}
    </div>
  );
}
