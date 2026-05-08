"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CategoryNode } from "@/lib/parts/categories";

type Props = {
  /** Pre-flattened tree (depth-first, with `path` and `depth` precomputed). */
  options: CategoryNode[];
  value: string;
  onChange: (id: string) => void;
  /** Visible when no category is selected. */
  placeholder?: string;
  /** Optional "no filter" entry rendered at the top (used by the list filter). */
  allOption?: { value: string; label: string };
  id?: string;
  className?: string;
  disabled?: boolean;
};

export function CategoryPicker({
  options,
  value,
  onChange,
  placeholder = "Pick a category…",
  allOption,
  id,
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const selected = useMemo(
    () => options.find((o) => o.id === value),
    [options, value],
  );
  const triggerLabel = useMemo(() => {
    if (allOption && value === allOption.value) return allOption.label;
    if (selected) return selected.path.join(" › ");
    return placeholder;
  }, [allOption, selected, value, placeholder]);

  // Filter on the precomputed path so "drive cas" matches a deep "Drivetrain
  // > Cassettes" leaf even if the user types parts of two different ancestors.
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.path.join(" ").toLowerCase().includes(q),
    );
  }, [options, filter]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setFilter("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && (!allOption || value !== allOption.value)
              ? "text-muted-foreground"
              : "",
            className,
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown aria-hidden className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-1"
      >
        <div className="relative px-1 py-1">
          <Search
            aria-hidden
            className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="h-8 pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {allOption ? (
            <PickerItem
              label={allOption.label}
              depth={0}
              isSelected={value === allOption.value}
              onClick={() => pick(allOption.value)}
            />
          ) : null}
          {filtered.length === 0 ? (
            <p className="text-muted-foreground px-3 py-3 text-center text-xs">
              No matches
            </p>
          ) : (
            filtered.map((opt) => (
              <PickerItem
                key={opt.id}
                label={opt.name}
                depth={opt.depth}
                isSelected={value === opt.id}
                onClick={() => pick(opt.id)}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PickerItem({
  label,
  depth,
  isSelected,
  onClick,
}: {
  label: string;
  depth: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
        isSelected && "bg-muted",
      )}
      style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
    >
      <Check
        aria-hidden
        className={cn("size-3.5", isSelected ? "opacity-100" : "opacity-0")}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}
