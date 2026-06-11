"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Secondary line under the label (e.g. customer segment). Also searchable. */
  sublabel?: string | null;
};

type Props = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** Shown when the search matches nothing. */
  emptyMessage?: string;
  /** Shown instead of the list when there are no options at all. */
  emptyState?: React.ReactNode;
  disabled?: boolean;
  className?: string;
};

/**
 * Searchable single-select — a Select-shaped trigger opening a filterable
 * cmdk list. Use instead of Select when the option list can grow long
 * (customers, parts, …).
 */
export function Combobox({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Pick…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  emptyState,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          data-placeholder={selected ? undefined : ""}
          className={cn(
            // Mirrors SelectTrigger so the two sit side by side seamlessly.
            "border-input focus-visible:border-ring focus-visible:ring-ring/50 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 flex h-8 w-fit items-center justify-between gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className="line-clamp-1 text-left">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-72 p-0"
      >
        {options.length === 0 && emptyState ? (
          <div className="text-muted-foreground p-3 text-xs">{emptyState}</div>
        ) : (
          <Command>
            <CommandInput placeholder={searchPlaceholder} autoFocus />
            <CommandList id={listId}>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.sublabel ?? ""}`}
                    data-checked={o.value === value}
                    onSelect={() => {
                      onValueChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col">
                      <span>{o.label}</span>
                      {o.sublabel ? (
                        <span className="text-muted-foreground text-xs">
                          {o.sublabel}
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
