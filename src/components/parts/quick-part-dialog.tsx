"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { CategoryPicker } from "@/app/parts/_components/category-picker";
import {
  createPartInline,
  loadQuickPartCategories,
  type InlinePart,
} from "@/app/parts/_actions/create-part-inline";
import { flattenCategoryTree, type FlatCategory } from "@/lib/parts/categories";

export type { InlinePart };

/**
 * "New part" from inside a picker. The host keeps its own state — an unsaved
 * recipe, a half-filled order line — and receives the created part through
 * `onCreated`, so nothing is lost by the detour that no longer exists.
 *
 * Categories load when the dialog opens (`loadQuickPartCategories`), so a host
 * need not carry them. `seedText` is what the user had typed in the picker's
 * filter: it lands in the SKU when it looks like one (JP-…), else in the name.
 *
 * The form stops its submit from bubbling: this dialog is often opened from
 * inside another dialog's <form>, and React bubbles synthetic events through
 * portals — without the stop, creating a part would also submit the line.
 */
export function QuickPartDialog({
  open,
  onOpenChange,
  defaultCategoryId,
  seedText,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  defaultCategoryId?: string | null;
  seedText?: string;
  onCreated: (part: InlinePart) => void;
}) {
  const [categories, setCategories] = useState<FlatCategory[] | null>(null);

  // Loaded once, the first time the dialog opens.
  useEffect(() => {
    if (!open || categories !== null) return;
    let live = true;
    loadQuickPartCategories().then(
      (rows) => live && setCategories(rows),
      () => live && setCategories([]),
    );
    return () => {
      live = false;
    };
  }, [open, categories]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* DialogContent unmounts when closed, so the form starts fresh from
            the seed on every open. */}
        <QuickPartForm
          categories={categories}
          defaultCategoryId={defaultCategoryId ?? null}
          seedText={seedText ?? ""}
          onCancel={() => onOpenChange(false)}
          onCreated={(part) => {
            onCreated(part);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** A single token with a digit or a prefix dash (JP-504KL, 504KL) is a SKU. */
function seedLooksLikeSku(seed: string): boolean {
  return /^\S+$/.test(seed) && /\d|^[A-Za-z]{1,4}-/.test(seed);
}

function QuickPartForm({
  categories,
  defaultCategoryId,
  seedText,
  onCancel,
  onCreated,
}: {
  categories: FlatCategory[] | null;
  defaultCategoryId: string | null;
  seedText: string;
  onCancel: () => void;
  onCreated: (part: InlinePart) => void;
}) {
  const t = useTranslations("quickPart");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const seed = seedText.trim();
  const seedIsSku = seedLooksLikeSku(seed);
  const [sku, setSku] = useState(seedIsSku ? seed.toUpperCase() : "");
  const [nameEn, setNameEn] = useState(seedIsSku ? "" : seed);
  const [nameDa, setNameDa] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "");
  const [unit, setUnit] = useState("pcs");
  const [error, setError] = useState<{ text: string; field?: string } | null>(
    null,
  );
  const [pending, start] = useTransition();

  const options = useMemo(
    () => flattenCategoryTree(categories ?? [], locale),
    [categories, locale],
  );

  function submit() {
    setError(null);
    start(async () => {
      const r = await createPartInline({
        internalSku: sku,
        nameEn,
        nameDa: nameDa || null,
        categoryId,
        unitOfMeasure: unit,
      });
      if (!r.ok) {
        setError({ text: r.error, field: r.field });
        return;
      }
      onCreated(r.part);
    });
  }

  const fieldError = (f: string) => (error?.field === f ? error.text : null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <Field
        label={t("sku")}
        htmlFor="quick-part-sku"
        required
        error={fieldError("internal_sku")}
      >
        <Input
          id="quick-part-sku"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="JP-…"
          autoComplete="off"
          className="font-mono"
        />
      </Field>
      <Field
        label={t("nameEn")}
        htmlFor="quick-part-name-en"
        required
        error={fieldError("name_en")}
      >
        <Input
          id="quick-part-name-en"
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field
        label={t("nameDa")}
        htmlFor="quick-part-name-da"
        hint={t("nameDaHint")}
      >
        <Input
          id="quick-part-name-da"
          value={nameDa}
          onChange={(e) => setNameDa(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field
          label={t("category")}
          htmlFor="quick-part-category"
          required
          error={fieldError("category_id")}
        >
          <CategoryPicker
            id="quick-part-category"
            options={options}
            value={categoryId}
            onChange={setCategoryId}
            placeholder={categories === null ? t("loading") : t("pickCategory")}
            disabled={categories === null}
          />
        </Field>
        <Field label={t("unit")} htmlFor="quick-part-unit">
          <Input
            id="quick-part-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>
      <p className="text-muted-foreground text-xs">{t("laterHint")}</p>

      {error && !error.field ? (
        <p className="text-destructive text-sm" role="alert">
          {error.text}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("creating") : t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
