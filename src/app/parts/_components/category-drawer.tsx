"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { FILTER_ACTIVE_CLASS } from "@/lib/filter-style";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CategoryNode } from "@/lib/parts/categories";

type Props = {
  id?: string;
  /** Canonical-order nodes from flattenCategoryTree. */
  nodes: CategoryNode[];
  /** Catalog-wide part count per category id (missing key = 0). */
  countsByCategory: Record<string, number>;
  /** Current category id, or "all". */
  value: string;
  onChange: (value: string) => void;
};

/**
 * One-click category browser: a Select-shaped trigger opening a slide-over
 * with every category laid out in vertical columns (fill column 1 top-to-
 * bottom, then column 2, …) — no dropdown scroll-hunting. Counts
 * are catalog-wide (they ignore the other filters) so the grid doubles as a
 * stock overview; empty categories sit greyed at the bottom but stay
 * clickable.
 */
export function CategoryDrawer({
  id,
  nodes,
  countsByCategory,
  value,
  onChange,
}: Props) {
  const t = useTranslations("parts");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const totalCount = useMemo(
    () => Object.values(countsByCategory).reduce((a, b) => a + b, 0),
    [countsByCategory],
  );

  const { populated, empty } = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const visible = needle
      ? nodes.filter((n) => n.name.toLowerCase().includes(needle))
      : nodes;
    return {
      populated: visible.filter((n) => (countsByCategory[n.id] ?? 0) > 0),
      empty: visible.filter((n) => (countsByCategory[n.id] ?? 0) === 0),
    };
  }, [nodes, countsByCategory, filter]);

  const selected = nodes.find((n) => n.id === value);

  function handleOpenChange(next: boolean) {
    if (next) setFilter("");
    setOpen(next);
  }

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        id={id}
        data-placeholder={selected ? undefined : ""}
        className={cn(
          "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50 flex h-8 w-fit items-center justify-between gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3",
          value !== "all" && FILTER_ACTIVE_CLASS,
        )}
      >
        <span className="line-clamp-1 text-left">
          {selected ? selected.name : t("allCategories")}
        </span>
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0" />
      </SheetTrigger>
      <SheetContent
        className="gap-0 data-[side=right]:sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <SheetHeader className="pb-2">
          <SheetTitle>{t("pickCategory")}</SheetTitle>
          <SheetDescription>{t("drawerDescription")}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-3">
          <div className="border-input/50 bg-input/30 flex h-8 items-center gap-2 rounded-lg border px-2">
            <SearchIcon className="size-4 shrink-0 opacity-50" aria-hidden />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("filterCategories")}
              aria-label={t("filterCategories")}
              className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-hidden"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="columns-2 gap-1 sm:columns-3">
            {!filter.trim() && (
              <CategoryCell
                label={t("allCategories")}
                count={totalCount}
                active={value === "all"}
                onClick={() => pick("all")}
              />
            )}
            {populated.map((n) => (
              <CategoryCell
                key={n.id}
                label={n.name}
                depth={n.depth}
                count={countsByCategory[n.id] ?? 0}
                active={n.id === value}
                onClick={() => pick(n.id)}
              />
            ))}
          </div>
          {empty.length > 0 ? (
            <>
              <p className="text-muted-foreground mt-4 mb-1 text-xs">
                {t("emptyCategoriesLabel")}
              </p>
              <div className="columns-2 gap-1 sm:columns-3">
                {empty.map((n) => (
                  <CategoryCell
                    key={n.id}
                    label={n.name}
                    depth={n.depth}
                    count={0}
                    active={n.id === value}
                    muted
                    onClick={() => pick(n.id)}
                  />
                ))}
              </div>
            </>
          ) : null}
          {populated.length === 0 && empty.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("noCategoriesMatch")}
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CategoryCell({
  label,
  count,
  active,
  muted,
  depth = 0,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  muted?: boolean;
  depth?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mb-1 flex w-full break-inside-avoid items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted",
        muted && !active && "text-muted-foreground",
      )}
      style={depth > 0 ? { paddingLeft: `${10 + depth * 12}px` } : undefined}
    >
      <span className="line-clamp-1">{label}</span>
      <span
        className={cn(
          "text-xs tabular-nums",
          active ? "text-primary-foreground/70" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
