"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: string; name_en?: string | null; name?: string | null };

type Props = {
  categories: Array<{ id: string; name_en: string | null }>;
  suppliers: Array<{ id: string; name: string }>;
};

const STOCK_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All stock" },
  { value: "ok", label: "In stock" },
  { value: "low", label: "Low" },
  { value: "out", label: "Out" },
];

/**
 * URL search-params are the source of truth. The `q` input has local state
 * (so typing feels instant) plus a debounced sync to the URL; selects sync
 * immediately. Any change resets `page` to 1 so the user doesn't land on
 * an empty page after narrowing the filter.
 */
export function PartsFilters({ categories, suppliers }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentQ = searchParams.get("q") ?? "";
  const currentCategory = searchParams.get("category") ?? "all";
  const currentSupplier = searchParams.get("supplier") ?? "all";
  const currentStock = searchParams.get("stock") ?? "all";

  // Local state for the search input so keystrokes don't wait on the round-trip.
  const [qDraft, setQDraft] = useState(currentQ);

  // Reset the draft when the URL changes from elsewhere (e.g. back button).
  // Using the "adjust state during render" pattern — React skips the in-between
  // commit, so this doesn't cascade.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [lastUrlQ, setLastUrlQ] = useState(currentQ);
  if (currentQ !== lastUrlQ) {
    setLastUrlQ(currentQ);
    setQDraft(currentQ);
  }

  // Debounce search input → URL.
  useEffect(() => {
    if (qDraft === currentQ) return;
    const id = window.setTimeout(() => {
      pushParams({ q: qDraft || null, page: null });
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  function pushParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parts-search">Search</Label>
        <Input
          id="parts-search"
          type="search"
          placeholder="Search SKU, name, description, supplier SKU…"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
        />
      </div>

      <FilterSelect
        label="Category"
        id="parts-category"
        value={currentCategory}
        onChange={(value) => pushParams({ category: value, page: null })}
        options={[
          { value: "all", label: "All categories" },
          ...categories.map((c) => ({ value: c.id, label: c.name_en ?? "—" })),
        ]}
      />

      <FilterSelect
        label="Supplier"
        id="parts-supplier"
        value={currentSupplier}
        onChange={(value) => pushParams({ supplier: value, page: null })}
        options={[
          { value: "all", label: "All suppliers" },
          ...suppliers.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />

      <FilterSelect
        label="Stock"
        id="parts-stock"
        value={currentStock}
        onChange={(value) => pushParams({ stock: value, page: null })}
        options={STOCK_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />
    </div>
  );
}

function FilterSelect({
  label,
  id,
  value,
  onChange,
  options,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? "all")}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Suppress unused `Option` type warning — kept for future extension.
export type { Option };
