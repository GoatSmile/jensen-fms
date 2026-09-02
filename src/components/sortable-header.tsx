"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Props = {
  /** Whatever key the page's own sort whitelist understands. */
  column: string;
  label: string;
  align?: "left" | "right";
  className?: string;
  /**
   * Direction the FIRST click applies. Dates and quantities want the big end
   * first ("newest", "most"), text wants A–Z. Defaults to ascending.
   */
  firstDirection?: "asc" | "desc";
};

/**
 * Clickable column header, shared by every sortable list. URL is the source of
 * truth via `?sort=col` / `?sort=col:desc`, so a sorted view is a link. A third
 * click clears the sort and the page falls back to its own default.
 *
 * The `?page` param is dropped on every change so the user doesn't land on an
 * empty page after the row order changes.
 *
 * The column key means nothing here — each page maps it to a DB column (parts,
 * sorted in Postgres) or to a comparator (manufacturing orders, whose template
 * and customer labels are assembled from embeds).
 */
export function SortableHeader({
  column,
  label,
  align = "left",
  className,
  firstDirection = "asc",
}: Props) {
  const t = useTranslations("common");
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
    if (!isActive) return firstDirection;
    if (direction === firstDirection) {
      return firstDirection === "asc" ? "desc" : "asc";
    }
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
    direction === "asc"
      ? ArrowUp
      : direction === "desc"
        ? ArrowDown
        : ArrowUpDown;

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
        aria-label={
          direction
            ? t("sortAriaDir", {
                label,
                direction: direction === "asc" ? t("dirAsc") : t("dirDesc"),
              })
            : t("sortAria", { label })
        }
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
