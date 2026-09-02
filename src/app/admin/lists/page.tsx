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
  // Active first, then the vocabulary's own order — what the retired detail
  // pages did. Without it archived entries interleave with live ones, and the
  // status badge becomes the only thing separating them.
  query = query.order("is_active", { ascending: false });
  for (const order of vocab.order) {
    query = query.order(order.column, { ascending: order.ascending });
  }
  const rowsRes = await query;
  const rows = (rowsRes.data ?? []) as unknown as VocabRowData[];

  // Reference options for the two fields that point at other rows. Fetched only
  // for the vocabulary that needs them, so six of seven pay nothing.
  const needsParents = vocab.fields.some((field) => field.type === "parent");
  const needsCoatings = vocab.fields.some((field) => field.type === "coating");
  const needsCategories = vocab.fields.some(
    (field) => field.type === "partCategory",
  );

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

  // "In use" tallies: one query per referencing table, counted in memory the way
  // the retired detail pages did. Only the vocabularies that declare `usage` pay.
  const usageByRow: Record<string, number> = {};
  for (const source of vocab.usage ?? []) {
    let usageQuery = supabase
      .from(source.table)
      .select(source.column)
      .not(source.column, "is", null);
    if (source.excludeDeleted) usageQuery = usageQuery.is("deleted_at", null);
    const usageRes = await usageQuery;
    // `.select()` with a runtime column name can't be typed off the generated
    // schema, so the row shape is unknown here by construction.
    for (const record of (usageRes.data ?? []) as unknown as Record<
      string,
      unknown
    >[]) {
      const referenced = record[source.column];
      if (typeof referenced !== "string") continue;
      usageByRow[referenced] = (usageByRow[referenced] ?? 0) + 1;
    }
  }

  // Locations' two non-field controls need app_settings.
  let locationsHidden = false;
  let primaryLocationId: string | null = null;
  if (vocab.hasLocationControls) {
    const settingsRes = await supabase
      .from("app_settings")
      .select("hide_location_info, primary_location_id")
      .eq("id", 1)
      .maybeSingle();
    locationsHidden = settingsRes.data?.hide_location_info ?? false;
    primaryLocationId = settingsRes.data?.primary_location_id ?? null;
  }

  // Painter types claim a part category. Only the leaf-ish list matters here —
  // every active category is offered and the unique index refuses a second
  // claim, so an ambiguous default is impossible rather than merely discouraged.
  let categoryOptions: SelectOption[] = [];
  let undecidedByCategory: Record<string, number> = {};
  if (needsCategories) {
    const [catsRes, undecidedRes] = await Promise.all([
      supabase
        .from("part_categories")
        .select("id, name_en, name_da")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name_en", { ascending: true }),
      // What "apply" would actually touch: filed here, nobody has decided, and
      // not deliberately exempt.
      supabase
        .from("parts")
        .select("category_id")
        .is("service_part_type_id", null)
        .eq("paint_exempt", false)
        .is("deleted_at", null)
        .not("category_id", "is", null),
    ]);
    categoryOptions = (catsRes.data ?? []).map((row) => ({
      value: String(row.id),
      label: localizedName(
        locale,
        row.name_en as string | null,
        row.name_da as string | null,
      ),
    }));
    undecidedByCategory = (undecidedRes.data ?? []).reduce<
      Record<string, number>
    >((acc, row) => {
      const key = String(row.category_id);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }

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
            categoryOptions={categoryOptions}
            undecidedByCategory={undecidedByCategory}
            usageByRow={usageByRow}
            locationsHidden={locationsHidden}
            primaryLocationId={primaryLocationId}
          />
        </div>
      </div>
    </div>
  );
}
