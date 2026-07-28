import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { localizedName } from "@/i18n/vocab";
import { resolveVocab } from "@/lib/admin/vocabularies";
import { createClient } from "@/lib/supabase/server";

import { VocabSubRail } from "./_components/vocab-subrail";
import { VocabTable } from "./_components/vocab-table";
import type {
  SelectOption,
  VocabRowData,
} from "./_components/vocab-row-editor";

/**
 * `/admin/lists` — one page for the seven controlled vocabularies that had 18
 * routes between them.
 *
 * Server-rendered per `?vocab=`, so only the active vocabulary's rows are
 * fetched and in the DOM, and a deep link is shareable (the project's
 * "URL search-params drive views" rule, and the same shape as
 * `/admin/settings?section=`).
 */
export default async function AdminListsPage({
  searchParams,
}: {
  searchParams: Promise<{ vocab?: string }>;
}) {
  const vocab = resolveVocab((await searchParams).vocab);
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("adminLists"),
    getTranslations("common"),
    getLocale(),
  ]);
  const supabase = await createClient();

  // `.is("deleted_at", null)` ONLY where the column exists. part_categories is
  // the only one of the seven that has it, and adding the filter to a table
  // without it makes PostgREST return zero rows silently (CLAUDE.md's reflex
  // check — commit 98cef10).
  let query = supabase.from(vocab.table).select(vocab.select);
  if (vocab.hasDeletedAt) query = query.is("deleted_at", null);
  for (const order of vocab.order) {
    query = query.order(order.column, { ascending: order.ascending });
  }
  const rowsRes = await query;
  const rows = (rowsRes.data ?? []) as unknown as VocabRowData[];

  // Reference options for the two fields that point at other rows. Fetched only
  // for the vocabulary that needs them, so six of seven pay nothing.
  const needsParents = vocab.fields.some((field) => field.type === "parent");
  const needsCoatings = vocab.fields.some((field) => field.type === "coating");

  const parentOptions: SelectOption[] = needsParents
    ? rows.map((row) => ({
        value: row.id,
        label: localizedName(
          locale,
          row.name_en == null ? null : String(row.name_en),
          row.name_da == null ? null : String(row.name_da),
        ),
      }))
    : [];

  let coatingOptions: SelectOption[] = [];
  if (needsCoatings) {
    const coatingsRes = await supabase
      .from("coatings")
      .select("slug, label_en, label_da")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    coatingOptions = (coatingsRes.data ?? []).map((coating) => ({
      value: String(coating.slug),
      label: localizedName(
        locale,
        coating.label_en as string | null,
        coating.label_da as string | null,
      ),
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("crumbDashboard")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admin">{t("crumbAdmin")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-ink-2 text-sm">{t("subtitle")}</p>
      </div>

      {rowsRes.error ? (
        <p className="text-destructive text-sm" role="alert">
          {rowsRes.error.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <VocabSubRail active={vocab.id} />
        <div className="min-w-0 flex-1">
          <VocabTable
            vocabId={vocab.id}
            rows={rows}
            parentOptions={parentOptions}
            coatingOptions={coatingOptions}
          />
        </div>
      </div>
    </div>
  );
}
