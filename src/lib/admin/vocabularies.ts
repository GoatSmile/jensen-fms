import type { PanelHue } from "@/components/ui/panel";

/**
 * Descriptors for `/admin/lists` — the one page that replaces 18 routes
 * (six vocabularies × list + new + [id], plus coatings, which was a second
 * section on `/admin/colors`).
 *
 * **Why a descriptor layer rather than one shared form.** The plan assumed
 * these seven tables shared `{name_en, name_da, is_active, sort_order}`. They
 * do not — checked against the live schema 2026-07-28, the ONLY column all
 * seven have is `is_active`. Even the name comes in four shapes:
 * `name_en`/`name_da` (colours, segments, categories, locations), a bare `name`
 * (families), `label_en`/`label_da` (coatings), and `code` + `description`
 * (HS codes). Two tables have no `sort_order` at all. So "render the same four
 * fields seven times" collapses immediately, and the shape that survives is a
 * per-vocabulary field list read by one renderer.
 *
 * **The server actions are reused unchanged.** Each vocabulary already exposes
 * `create(formData)` / `update(id, formData)` / `setActive(id, boolean)` with a
 * `{ ok } | { ok: false, error }` result, and the entity-specific rules live
 * inside them — the parent-cycle check for categories, "the primary location
 * cannot be archived" for locations. `_actions/dispatch.ts` routes to them and
 * the row UI just surfaces `error`. Nothing about those rules is reimplemented
 * here, which is the point: this page is a new front end on proven writers.
 *
 * `field.name` is a FormData key and MUST match the action's `parseFormData`
 * exactly — that is the contract this file encodes.
 */
export type VocabId =
  | "categories"
  | "colors"
  | "coatings"
  | "segments"
  | "families"
  | "hs-codes"
  | "locations";

/**
 * Literal union, not `string`: the Supabase client is typed off the generated
 * schema, so `from(vocab.table)` only compiles against known table names. That
 * also means a typo here is a build error rather than a runtime empty list.
 */
export type VocabTable =
  | "part_categories"
  | "colors"
  | "coatings"
  | "customer_segments"
  | "bike_families"
  | "hs_codes"
  | "inventory_locations";

export type VocabFieldType =
  | "text"
  | "textarea"
  | "number"
  | "percent"
  /** `#rrggbb`; the action also accepts a bare `rrggbb` and derives from RAL. */
  | "hex"
  /** Select over `coatings.slug`. */
  | "coating"
  /** Select over the same table's rows — categories' `parent_id`. */
  | "parent";

export type VocabField = {
  /** FormData key. Must match the action's `parseFormData`. */
  name: string;
  /** Key into the `adminLists` message namespace. */
  labelKey: string;
  type: VocabFieldType;
  required?: boolean;
  /** Narrow fields sit two-up in the editor grid; wide ones span it. */
  wide?: boolean;
};

export type VocabColumn = {
  name: string;
  labelKey: string;
  /** Hide on narrow screens — the row must stay readable on a phone. */
  className?: string;
  align?: "right";
};

export type VocabDescriptor = {
  id: VocabId;
  table: VocabTable;
  /** Rail label + panel title, in the `adminLists` namespace. */
  labelKey: string;
  hue: PanelHue;
  /** Where this vocabulary lived before; kept for the commit-2 redirects. */
  legacyRoute: string;
  /**
   * `part_categories` is the ONLY one of the seven with `deleted_at`. Adding
   * `.is("deleted_at", null)` to a table without the column makes PostgREST
   * return zero rows silently (CLAUDE.md's reflex check — it bit once already,
   * commit 98cef10), so this flag drives the filter rather than a guess.
   */
  hasDeletedAt: boolean;
  select: string;
  order: { column: string; ascending: boolean }[];
  /** Builds the row's title. A pair renders localized; a single renders raw. */
  title: { en: string; da?: string };
  /** Column holding a hex colour to show as a swatch beside the title. */
  swatchField?: string;
  columns: VocabColumn[];
  fields: VocabField[];
  /** Namespace holding ArchivePanel's six shared archive/restore keys. */
  archiveNamespace: string;
  /** `adminLists` key for the archive consequence copy — per entity, and load-bearing. */
  archiveCopyKey: string;
  /**
   * True when the vocabulary's `parseFormData` reads
   * `is_active: formData.get("is_active") === "on"`. For those, an ABSENT field
   * means `false` — so the editor must always post the row's current state or
   * saving a rename would silently archive the row. Six of seven do this;
   * `coatings` alone leaves `is_active` out of its parse.
   */
  isActiveInFormData: boolean;
};

const SORT_FIELD: VocabField = {
  name: "sort_order",
  labelKey: "fieldSortOrder",
  type: "number",
};

export const VOCABULARIES: VocabDescriptor[] = [
  {
    id: "categories",
    table: "part_categories",
    labelKey: "vocabCategories",
    hue: "buy",
    legacyRoute: "/admin/categories",
    hasDeletedAt: true,
    select:
      "id, slug, name_en, name_da, parent_id, description_en, description_da, sort_order, is_active",
    order: [
      { column: "sort_order", ascending: true },
      { column: "name_en", ascending: true },
    ],
    title: { en: "name_en", da: "name_da" },
    columns: [
      { name: "parent_id", labelKey: "fieldParent" },
      { name: "slug", labelKey: "fieldSlug", className: "hidden sm:table-cell" },
      {
        name: "sort_order",
        labelKey: "fieldSortOrder",
        className: "hidden md:table-cell",
        align: "right",
      },
    ],
    fields: [
      { name: "name_en", labelKey: "fieldNameEn", type: "text", required: true },
      { name: "name_da", labelKey: "fieldNameDa", type: "text" },
      { name: "parent_id", labelKey: "fieldParent", type: "parent" },
      { name: "description_en", labelKey: "fieldDescriptionEn", type: "textarea", wide: true },
      { name: "description_da", labelKey: "fieldDescriptionDa", type: "textarea", wide: true },
      SORT_FIELD,
    ],
    archiveNamespace: "adminCategories",
    archiveCopyKey: "archiveCopyCategories",
    isActiveInFormData: true,
  },
  {
    id: "colors",
    table: "colors",
    labelKey: "vocabColors",
    hue: "brand",
    legacyRoute: "/admin/colors",
    hasDeletedAt: false,
    select:
      "id, slug, name_en, name_da, hex, ral_code, coating, sort_order, is_active",
    order: [
      { column: "sort_order", ascending: true },
      { column: "name_en", ascending: true },
    ],
    title: { en: "name_en", da: "name_da" },
    swatchField: "hex",
    columns: [
      { name: "ral_code", labelKey: "fieldRalCode", className: "hidden sm:table-cell" },
      { name: "coating", labelKey: "fieldCoating", className: "hidden md:table-cell" },
      {
        name: "sort_order",
        labelKey: "fieldSortOrder",
        className: "hidden md:table-cell",
        align: "right",
      },
    ],
    fields: [
      { name: "name_en", labelKey: "fieldNameEn", type: "text", required: true },
      { name: "name_da", labelKey: "fieldNameDa", type: "text" },
      { name: "hex", labelKey: "fieldHex", type: "hex" },
      { name: "ral_code", labelKey: "fieldRalCode", type: "text" },
      { name: "coating", labelKey: "fieldCoating", type: "coating" },
      SORT_FIELD,
    ],
    archiveNamespace: "adminColors",
    archiveCopyKey: "archiveCopyColors",
    isActiveInFormData: true,
  },
  {
    id: "coatings",
    table: "coatings",
    labelKey: "vocabCoatings",
    hue: "brand",
    legacyRoute: "/admin/colors",
    hasDeletedAt: false,
    select: "id, slug, label_en, label_da, sort_order, is_active",
    order: [
      { column: "sort_order", ascending: true },
      { column: "label_en", ascending: true },
    ],
    title: { en: "label_en", da: "label_da" },
    columns: [
      { name: "slug", labelKey: "fieldSlug", className: "hidden sm:table-cell" },
      {
        name: "sort_order",
        labelKey: "fieldSortOrder",
        className: "hidden md:table-cell",
        align: "right",
      },
    ],
    fields: [
      { name: "label_en", labelKey: "fieldLabelEn", type: "text", required: true },
      { name: "label_da", labelKey: "fieldLabelDa", type: "text" },
      SORT_FIELD,
    ],
    archiveNamespace: "adminColors",
    archiveCopyKey: "archiveCopyCoatings",
    // `manage-coatings.ts` leaves is_active out of parseFormData entirely.
    isActiveInFormData: false,
  },
  {
    id: "segments",
    table: "customer_segments",
    labelKey: "vocabSegments",
    hue: "good",
    legacyRoute: "/admin/customer-segments",
    hasDeletedAt: false,
    select:
      "id, slug, name_en, name_da, description_en, description_da, sort_order, is_active",
    order: [
      { column: "sort_order", ascending: true },
      { column: "name_en", ascending: true },
    ],
    title: { en: "name_en", da: "name_da" },
    columns: [
      { name: "slug", labelKey: "fieldSlug", className: "hidden sm:table-cell" },
      {
        name: "sort_order",
        labelKey: "fieldSortOrder",
        className: "hidden md:table-cell",
        align: "right",
      },
    ],
    fields: [
      { name: "name_en", labelKey: "fieldNameEn", type: "text", required: true },
      { name: "name_da", labelKey: "fieldNameDa", type: "text" },
      { name: "description_en", labelKey: "fieldDescriptionEn", type: "textarea", wide: true },
      { name: "description_da", labelKey: "fieldDescriptionDa", type: "textarea", wide: true },
      SORT_FIELD,
    ],
    archiveNamespace: "adminSegments",
    archiveCopyKey: "archiveCopySegments",
    isActiveInFormData: true,
  },
  {
    id: "families",
    table: "bike_families",
    labelKey: "vocabFamilies",
    hue: "system",
    legacyRoute: "/admin/families",
    hasDeletedAt: false,
    select: "id, name, sort_order, is_active",
    order: [
      { column: "sort_order", ascending: true },
      { column: "name", ascending: true },
    ],
    // Families carry ONE name column, deliberately English (CLAUDE.md).
    title: { en: "name" },
    columns: [
      {
        name: "sort_order",
        labelKey: "fieldSortOrder",
        className: "hidden md:table-cell",
        align: "right",
      },
    ],
    fields: [
      { name: "name", labelKey: "fieldName", type: "text", required: true },
      SORT_FIELD,
    ],
    archiveNamespace: "adminFamilies",
    archiveCopyKey: "archiveCopyFamilies",
    isActiveInFormData: true,
  },
  {
    id: "hs-codes",
    table: "hs_codes",
    labelKey: "vocabHsCodes",
    hue: "buy",
    legacyRoute: "/admin/hs-codes",
    hasDeletedAt: false,
    select: "id, code, description, tariff_pct, anti_dumping_pct, notes, is_active",
    order: [{ column: "code", ascending: true }],
    // No name pair at all: the code IS the identity, description is English.
    title: { en: "code" },
    columns: [
      // HS descriptions run to full customs-nomenclature length ("Containers/bags
      // with outer surface of plastic sheeting or textile materials: other,
      // other"). Unconstrained it pushed tariff and status off the right edge —
      // the table scrolls, but the two columns an admin came to read were the
      // ones out of view. Truncate here, full text in the editor.
      {
        name: "description",
        labelKey: "fieldDescription",
        className: "hidden max-w-[20rem] truncate sm:table-cell",
      },
      { name: "tariff_pct", labelKey: "fieldTariffPct", align: "right" },
      {
        name: "anti_dumping_pct",
        labelKey: "fieldAntiDumpingPct",
        className: "hidden md:table-cell",
        align: "right",
      },
    ],
    fields: [
      { name: "code", labelKey: "fieldCode", type: "text", required: true },
      { name: "description", labelKey: "fieldDescription", type: "text", required: true },
      { name: "tariff_pct", labelKey: "fieldTariffPct", type: "percent", required: true },
      { name: "anti_dumping_pct", labelKey: "fieldAntiDumpingPct", type: "percent" },
      { name: "notes", labelKey: "fieldNotes", type: "textarea", wide: true },
    ],
    archiveNamespace: "adminHsCodes",
    archiveCopyKey: "archiveCopyHsCodes",
    isActiveInFormData: true,
  },
  {
    id: "locations",
    table: "inventory_locations",
    labelKey: "vocabLocations",
    hue: "system",
    legacyRoute: "/admin/locations",
    hasDeletedAt: false,
    // No sort_order on this table.
    select: "id, code, name_en, name_da, address, is_active",
    order: [{ column: "code", ascending: true }],
    title: { en: "name_en", da: "name_da" },
    columns: [
      { name: "code", labelKey: "fieldCode" },
      { name: "address", labelKey: "fieldAddress", className: "hidden sm:table-cell" },
    ],
    fields: [
      { name: "code", labelKey: "fieldCode", type: "text", required: true },
      { name: "name_en", labelKey: "fieldNameEn", type: "text", required: true },
      { name: "name_da", labelKey: "fieldNameDa", type: "text" },
      { name: "address", labelKey: "fieldAddress", type: "textarea", wide: true },
    ],
    archiveNamespace: "adminLocations",
    archiveCopyKey: "archiveCopyLocations",
    isActiveInFormData: true,
  },
];

export const DEFAULT_VOCAB: VocabId = "categories";

/**
 * Resolve `?vocab=` to a real vocabulary. Unknown or absent falls back to the
 * default rather than rendering an empty page — the param is hand-editable and
 * arrives from bookmarks (same reasoning as `resolveSettingsSection`).
 */
export function resolveVocab(raw: string | undefined): VocabDescriptor {
  return VOCABULARIES.find((v) => v.id === raw) ?? getVocab(DEFAULT_VOCAB);
}

export function getVocab(id: VocabId): VocabDescriptor {
  const found = VOCABULARIES.find((v) => v.id === id);
  if (!found) throw new Error(`Unknown vocabulary: ${id}`);
  return found;
}
