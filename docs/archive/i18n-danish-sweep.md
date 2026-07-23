# i18n — whole-app Danish sweep (2026-07-11 → 2026-07-14, complete)

Extracted from `CLAUDE.md` on 2026-07-23 during the docs restructure. The
**durable i18n rules** (mechanism, per-surface locale, errors namespace,
`localizedName`, deliberately-English list) live in CLAUDE.md — this file
preserves the sweep narrative: which cluster shipped in which commit, and
the method notes. Scope was the whole app to Danish; `de` scaffolded but
untranslated (German ops is strategic, no user yet).

## Mechanism (foundation shipped 2026-07-11)
next-intl WITHOUT URL routing — locale comes from `app_settings`, per
surface. `src/middleware.ts` stamps `x-pathname`; `src/i18n/request.ts`
resolves worker surfaces (`/work`, `/scan`, the build workbench + batch
build, via `WORKER_PATH`) to `worker_language` and everything else to
`app_language`. Missing keys deep-merge back to English (a partial
translation degrades gracefully, never crashes). Messages in
`messages/{en,da,de}.json`, namespaced per surface;
`NextIntlClientProvider` in the root layout serves client components.

## Worker surfaces (completed first)
`/work` floor + `/scan`, the WO workspace cluster — `/work/[woId]` (notes,
parts, photos), `/work/[woId]/parts` add-parts screen, the shared
`DictateButton` (namespaces `wo` / `woParts` / `dictate`) — and (commit
6676278) the build workbench + batch build: workbench, pick list, batch
grid + both pages (namespaces `build` / `batchBuild` / `bikeStatus`), plus
the shared recipe components (`src/components/recipe/`) and the
`IdentifierDialog` (`recipe` / `identifierDialog`) — those two are shared
with app surfaces, where they render `app_language` per the normal
per-surface resolution. All browser-verified in both languages. Altitude
fixes along the way: `loadBuildQueue` returns structured
`atSupplier`/`shortfallCount` instead of an English `blockedReason`, and
`src/lib/work/elapsed.ts` is word-free (`atTimeLabel` + `elapsedShort`;
screens compose "Started {time} · {elapsed} ago" from messages).

## App-wide sweep (keyed off `app_language`), one commit per cluster
- **App chrome** (2d9f7a9) — both navs render from a shared
  `src/components/nav-items.ts`, so they can't drift; `nav` namespace.
- **Dashboard** (67d735c) — `dashboard` namespace incl. the month
  drill-down's server side (`loadMonthDetail` + `loadMonthDetailAction`
  translate via `getTranslations`); chart month labels use the active
  locale.
- **Bikes** (dab6c1a) — `bikes` + `bikeDetail`, plus the shared `common`
  namespace (Cancel/Saving…/Apply/Clear all/confirm-repeat/Dashboard crumb
  — reused in later clusters).
- **Bike templates** (69c8b34) — `templates` + `templateDetail`: list,
  detail incl. recipe/paintwork/kit-labelling/version-history, form.
- **Parts** (908cde8) — `parts` + `partDetail`: list + all filters, detail
  + every section, forms, stock-value report, print catalog.
- **Maintenance** (f72f7f3) — `tickets` + `workOrders` + `maintenance`:
  tickets list/detail/new/edit + form + header + WO-for-ticket section;
  work-orders list/detail/new + header + details/parts sections + add-part
  dialog (price preview via `formatMoney`) + form.
- **Manufacturing orders** (b1ea040) — `mo` (list + batch/one-off creation
  forms), `moDetail` (header/status transitions, stat tiles, plan, stock
  coverage + draft-PO, bikes section, parts recipe + substitute/add
  dialogs, both print pages).
- **Purchase orders** (b58b0fb) — `po` (list/new/edit/form), `poDetail`
  (header + transitions + email-supplier dialog + cancel dialog, stat
  tiles, lines section, line dialog incl. FX-lookup hints + landed-cost
  breakdown + import-tax hints, receive form). Supplier-facing PO print
  stays English by design.
- **Sales orders** (c5f8b0e) — `so` (list/new/edit/form/header), `soDetail`
  (stat tiles, lines + line dialog, linked-MOs + linked-paint + payments +
  production-note sections, deposit flow, paint-from-SO flow); new
  `soStatus` enum namespace + shared `deliveryWeek` namespace for
  `DeliveryWeekDateField` (used by MO/SO/template forms).
- **Paint orders** (dc0e3d1) — `paintOrders` (list/new/form),
  `paintOrderDetail` (header + transitions + cancel dialog, details,
  service-order items + add-item dialog, bikes + add-bike dialog); new
  `serviceOrderStatus` enum namespace bakes in the painter noun (paint is
  the only service type so far — always passes `PAINT_SUPPLIER_NOUN`;
  revisit if a second service type lands). Also cleared the SO detail's
  linked-paint island.
- **Invoices** (0eea3db) — `invoices` (list KPIs, all four section cards,
  tables, empty states, create/fee-draft buttons), `invoiceDetail` (detail
  + `InvoiceActions` armed states + `EconomicSyncCard`); new
  `invoiceStatus` enum namespace. Closed the last cross-cluster island
  (invoice status on the SO payments section).
- **Service agreements** (71688b7) — `serviceAgreements` (list),
  `serviceAgreementDetail` (coverage labels, fields, bikes-in-scope +
  covered-WO sections), `serviceAgreementForm`; new `saStatus` enum
  namespace; covered-WO status reuses `woStatus`.
- **Customers/orgs** (bf91d31, the largest) — `customers`,
  `customerDetail` (+ archive dialog), `assignedBikes`, `contacts`,
  `units`, `customerForm`, `customerMap` (map page + Leaflet component);
  shared `lang` namespace (da/en language names); map + assigned-bikes
  moved to the `bikeStatus` namespace, retiring the last
  `bikeStatusLabel()` call sites.
- **Admin cluster** (84013ee, the last big one) — nine sub-modules:
  `adminCategories`, `adminColors`, `adminHsCodes`, `adminKits`,
  `adminLocations`, `adminSegments`, `adminServices`, `adminSettings`,
  `adminSuppliers` — 490 keys; joins the already-done
  `adminHome`/`adminFx`/`adminFamilies` (dd80151). `ReportUrlCard`
  translated under `adminSettings`; `CopyButton` gained an optional
  `copiedLabel` prop.
- **Global-chrome leftovers** (0942f63, 2026-07-13) — the shared-password
  login screen (`auth` namespace) + the mobile scan FAB aria-label
  (`scan.fabLabel`). Every visible UI surface swept.

## Enum labels became message namespaces
`bikeStatus`, `stockStatus`, `movementType`, `moStatus`, `ticketStatus`,
`ticketPriority`, `ticketSource`, `woStatus`, `poStatus`,
`importTaxBasis`, `soStatus`, `serviceOrderStatus`, `invoiceStatus`,
`saStatus`, plus shared `lang`. Pattern: `getTranslations("moStatus")` then
`t(status)`, with `t.has(status)` guarding open-ended enums. The old
`*Label()` lib helpers are unused in the app — delete when convenient (see
`docs/BACKLOG.md`).

## Server-action error-string mop-up (complete 2026-07-13)
Every English error string an action returns/throws is localized AT THE
SOURCE: `const t = await getTranslations("errors")` → `t("key")` /
`t("key", { detail })`. Locale resolves per-surface in action context (the
action POST hits the page path; middleware stamps `x-pathname`) — verified
live in Danish. Shared flat `errors` namespace (~560 keys, en+da): common
cross-module keys + module-prefixed keys (`bike*`/`tpl*`/`part*`/
`ticket*`/`wo*`/`mo*`/`po*`/`so*`/`paint*`/`inv*`/`org*`/`sa*`/`admin*`).
Rule: only human-authored string literals convert; Supabase-destructured
`error:` bindings, console strings, comments, page-load data-fetch throws,
internal control-flow throws, and supplier/e-conomic verbatim API errors
stay as-is; raw DB/API messages ride along as `{detail}`. Shipped across
commits fd18b1a, c2c1df7, a2b6855, 6b20989, 847fc83, ca89d23, 0beeefe.
Excluded by design (own per-document language): the public `/b/[bikeId]` +
`/report` action files; `test-economic.ts` + `push-economic.ts`. Deferred:
fx-rates ok:true success `message:` strings (not errors). Method note:
modules ran as parallel agents returning a `{key:{en,da}}` map for a
CENTRAL JSON merge (never editing `messages/*.json` concurrently); a
mid-sweep API session limit was worked around via an exact import+replace
script (`scratchpad/i18n_convert.py` pattern).

## Controlled-vocab names (shipped 2026-07-14)
Every controlled-vocab name renders in the active locale via
`localizedName(locale, en, da)` in `src/i18n/vocab.ts` (da→`name_da||
name_en`, en→`name_en||name_da` — a blank never renders empty). Locale from
`getLocale()` (server) / `useLocale()` (client). No migration, no data
entry — the schema was already bilingual and `name_da` already authored.
Covered the 10 vocabs (part_categories, bike_types, bike_identifier_types,
tax_identifier_types, vat_codes, service_types, service_part_types,
customer_segments, colors, inventory_locations) across ~90 files. Patterns:
most render sites wrap `localizedName` inline after adding `name_da` to the
embed; where a value was pre-composed by a parent, the PARENT remaps
`name_en → localizedName(...)` before passing (MO detail, bike detail
identifier options, template paintwork); the parts LIST `category_name`
(DB-view column) is localized via a `categoryNameById` lookup;
`flattenCategoryTree` / `buildParentOptions` gained a `locale` param. Admin
vocab-management sections lead with the localized name + show the other
language as a muted subtitle (differs-only).
`colorFinishLabel`/`coatingLabel` already carried da labels; call sites
pass the locale (coerced `"en"|"da"` — the fn doesn't accept `de`).

Verified in the browser in Danish, then `app_language` restored to `en` —
flipping it to `da` is the owner's 1-click go-live. `worker_language`
becomes per-user at M1.
