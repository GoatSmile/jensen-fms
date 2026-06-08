export { Section } from "@/components/section";

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-20 items-center justify-center text-sm">
      {children}
    </div>
  );
}
