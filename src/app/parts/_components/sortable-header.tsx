"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortColumn =
  | "internal_sku"
  | "name_en"
  | "category_name"
  | "primary_supplier_name"
  | "stock_on_hand"
  | "last_cost_dkk";

type Props = {
  column: SortColumn;
  label: string;
  align?: "left" | "right";
  className?: string;
};

/**
 * Clickable column header. URL is the source of truth via `?sort=col` /
 * `?sort=col:desc`. A third click clears the sort.
 *
 * The `?page` param is dropped on every change so the user doesn't land on
 * an empty page after the row order changes.
 */
export function SortableHeader({ column, label, align = "left", className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const raw = searchParams.get("sort") ?? "";
  const [activeCol, activeDir] = raw.split(":") as [string, string | undefined];
  const isActive = activeCol === column;
  const direction: "asc" | "desc" | null = !isActive
    ? null
    : activeDir === "desc"
      ? "desc"
      : "asc";

  function next(): "asc" | "desc" | null {
    if (!isActive) return "asc";
    if (direction === "asc") return "desc";
    return null;
  }

  function onClick() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    const dir = next();
    if (dir === null) {
      params.delete("sort");
    } else if (dir === "asc") {
      params.set("sort", column);
    } else {
      params.set("sort", `${column}:desc`);
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const Icon =
    direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "hover:text-foreground inline-flex items-center gap-1 transition-colors",
          align === "right" ? "ml-auto" : "",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
        aria-label={`Sort by ${label}${direction ? `, currently ${direction}` : ""}`}
      >
        {align === "right" ? (
          <>
            <Icon
              aria-hidden
              className={cn("size-3", !isActive && "opacity-50")}
            />
            <span>{label}</span>
          </>
        ) : (
          <>
            <span>{label}</span>
            <Icon
              aria-hidden
              className={cn("size-3", !isActive && "opacity-50")}
            />
          </>
        )}
      </button>
    </TableHead>
  );
}
