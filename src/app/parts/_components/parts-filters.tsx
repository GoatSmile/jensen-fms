"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
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
import {
  flattenCategoryTree,
  type FlatCategory,
} from "@/lib/parts/categories";
import { cn } from "@/lib/utils";
import { FILTER_ACTIVE_CLASS } from "@/lib/filter-style";
import { kitCode } from "@/lib/kits/colors";

import { CategoryDrawer } from "./category-drawer";

type Option = { id: string; name_en?: string | null; name?: string | null };

type Props = {
  categories: FlatCategory[];
  categoryCounts: Record<string, number>;
  suppliers: Array<{ id: string; name: string }>;
  kits: Array<{ id: string; sticker_color: string; kit_number: number | null }>;
};

const STOCK_VALUES = ["ok", "low", "out"] as const;

/**
 * URL search-params are the source of truth. The `q` input has local state
 * (so typing feels instant) plus a debounced sync to the URL; selects sync
 * immediately. Any change resets `page` to 1 so the user doesn't land on
 * an empty page after narrowing the filter.
 */
export function PartsFilters({
  categories,
  categoryCounts,
  suppliers,
  kits,
}: Props) {
  const t = useTranslations("parts");
  const tStock = useTranslations("stockStatus");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentQ = searchParams.get("q") ?? "";
  const currentCategory = searchParams.get("category") ?? "all";
  const currentSupplier = searchParams.get("supplier") ?? "all";
  const currentKit = searchParams.get("kit") ?? "all";
  const currentStock = searchParams.get("stock") ?? "all";

  const categoryNodes = useMemo(
    () => flattenCategoryTree(categories, locale),
    [categories, locale],
  );

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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parts-search">{t("searchLabel")}</Label>
        <Input
          id="parts-search"
          type="search"
          placeholder={t("searchPlaceholder")}
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          className={cn(qDraft.trim() && FILTER_ACTIVE_CLASS)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parts-category">{t("categoryLabel")}</Label>
        <CategoryDrawer
          id="parts-category"
          nodes={categoryNodes}
          countsByCategory={categoryCounts}
          value={currentCategory}
          onChange={(value) => pushParams({ category: value, page: null })}
        />
      </div>

      <FilterSelect
        label={t("supplierLabel")}
        id="parts-supplier"
        value={currentSupplier}
        onChange={(value) => pushParams({ supplier: value, page: null })}
        options={[
          { value: "all", label: t("allSuppliers") },
          ...suppliers.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />

      <FilterSelect
        label={t("kitLabel")}
        id="parts-kit"
        value={currentKit}
        onChange={(value) => pushParams({ kit: value, page: null })}
        options={[
          { value: "all", label: t("allKits") },
          ...kits.map((k) => ({
            value: k.id,
            label: kitCode(k.sticker_color, k.kit_number),
          })),
        ]}
      />

      <FilterSelect
        label={t("stockLabel")}
        id="parts-stock"
        value={currentStock}
        onChange={(value) => pushParams({ stock: value, page: null })}
        options={[
          { value: "all", label: t("allStock") },
          ...STOCK_VALUES.map((v) => ({ value: v, label: tStock(v) })),
        ]}
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
        <SelectTrigger
          id={id}
          className={cn(value !== "all" && FILTER_ACTIVE_CLASS)}
        >
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
