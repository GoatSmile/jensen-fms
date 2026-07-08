# Build plan — July 2 2026 meeting backlog (items 1–6)

**Source:** Dennis app-review call 2026-07-02 (transcript in
`~/Documents/1-Projects/Jensen/Misc - Transcripts/`). Newer than the June 19
backlog in CLAUDE.md. Items verified against live code 2026-07-07.
**Status:** proposed — awaiting go-ahead + sequencing.
**Effort key:** `~X human-dev-min (Y min wait)` per CLAUDE.md convention.

Already-shipped asks from the same call (for reference, NOT in this plan):
template family grouping, per-PO-line transport %, category sort order +
vertical picker, paint per-line colour/scope/finish, additive svaj pricing,
test-data cleanup, AI part-image fetch.

Explicitly **won't do** (owner + dev agreed in-call): creating a part inline
from *inside* the PO add-part screen — keep part creation on the parts screen
("keeps it clean"). Item 1 below is the accepted alternative.

---

## Item 1 — Supplier + supplier-SKU on the new-part screen
**Goal:** when creating a part, optionally enter one supplier + that supplier's
article number, so a new Shimano part can be captured with its real number
without a detour through a PO. (Extra suppliers still added later on the detail.)

**Approach:** add an optional supplier picker + `supplier_sku` text input to the
create form. On submit, after the part inserts, write one
`part_supplier_offerings` row (`is_preferred = true`). Optional — a part can
still be created with no supplier.

**Files**
- `src/app/parts/_components/part-form.tsx` — add supplier `<Select>` +
  supplier-SKU input (create mode; harmless in edit mode too, but scope to
  create to avoid duplicating the detail-page offering editor).
- `src/app/parts/new/page.tsx` — fetch active suppliers, pass to form; replace
  the "Add suppliers after the part is created" copy.
- `src/app/parts/_actions/save-part.ts` — on create, if supplier+SKU present,
  insert the preferred offering (reuse the shape in
  `src/app/parts/[id]/_actions/offerings.ts`).

**Schema:** none.
**Effort:** ~40 min (20 min wait).
**Open Q:** allow only one supplier at create (rec: yes — keep it light), rest
on the detail page.

---

## Items 2 + 3 — Import-tax origin model (share one migration)
These are the same feature from two angles, so build together.

**Goal:**
- **(3) EU vs rest-of-world origin per part** drives whether import tax applies
  by default. Dennis's rule: EU-origin → no tariff; non-EU → tariff. "EU and the
  rest," nothing finer.
- **(2) "Import duty paid by supplier"** — even for a non-EU part, if the
  supplier delivered duty-paid (his Shimano case), the import-tax bucket is zero.
  Defaultable per supplier, still overridable per PO line.

**Model (respects frozen-at-purchase landed cost):** both concepts simply drive
the **snapshotted `tariff_pct` (and `anti_dumping_pct`) to 0** on the PO line —
same mechanism as today, the GENERATED `landed_cost_dkk_per_unit` recomputes
automatically. The HS code stays on the line for records.

- `parts.origin` — `'eu' | 'non_eu'`, nullable (unclassified). Migration 54.
- `suppliers.import_duty_prepaid_default boolean not null default false`. Mig 52.
- PO line dialog gains one **"Apply import tax"** checkbox. Initial state:
  `origin = 'non_eu'  AND NOT supplier.import_duty_prepaid_default`.
  - Checked → snapshot HS `tariff_pct` (+ `anti_dumping_pct`) as today.
  - Unchecked → snapshot both as 0.
  - A one-line hint explains the default ("EU origin — no import tax" /
    "duty prepaid by supplier" / "non-EU — import tax applies").
- Unclassified origin (`null`): default **off** (matches "initially without
  tariff, click to add") and nudge to classify.

**Files**
- `migrations/54_part_origin_and_supplier_duty.sql` — add the two columns
  (+ optional backfill: parts with an HS code but EU-made stay unclassified;
  leave data entry to the owner).
- `src/app/parts/_components/part-form.tsx` — origin picker (EU / rest of world
  / unclassified).
- `src/app/admin/suppliers/…` supplier form — "Import duty prepaid by default"
  checkbox (find the supplier edit form under admin).
- `src/app/purchase-orders/[id]/_components/line-dialog.tsx` — the "Apply import
  tax" checkbox, default logic, hint text, and wire it into the tariff preview
  (currently `:193-208` FX area / tariff snapshot) so the live landed-cost
  preview + the persisted `tariff_pct`/`anti_dumping_pct` both honor it.

**Schema:** migration 54 (2 columns).
**Effort:** ~90 min (35 min wait).
**Open Q (confirm):** (a) store an explicit `import_tax_applied`/reason flag on
the line for audit, or is `tariff_pct = 0` enough? (rec: 0 is enough, add a
derived reason in the UI only). (b) 3-state origin (eu/non_eu/unclassified) vs a
plain `is_eu_origin` boolean — rec: 3-state so "not yet classified" is honest.

---

## Item 7 — Family as a controlled vocabulary (admin-managed)
**Goal:** the template-family grouping already ships (flat, one level — the
accepted "option a": many varied templates under one family, not just sizes).
This makes `family` a **controlled vocab** instead of free text, killing
typo-fragmentation, and adds a deliberate family sort order (echoing the
category display-number Dennis liked). Decided direction, owner-confirmed.

**Model (mirrors `colors` / `part_categories`):**
- New table `bike_families`: `id`, `name` (single, not bilingual — proper
  product names like "Norma"), `sort_order int`, `is_active bool default true`,
  `created_at`. `name` unique.
- FK `bike_templates.family_id → bike_families.id` (nullable → "Ungrouped").
- Backfill in the same migration: seed `bike_families` from the existing
  distinct `bike_templates.family` strings, set `family_id`, then **drop the old
  `family` text column** (owner-confirmed — the one irreversible step, done
  after backfill).
- Archive (`is_active = false`) hides a family from the picker but leaves
  historical templates grouped — standard controlled-vocab convention.

**Files**
- `migrations/52_bike_families.sql` (additive) + `migrations/53_drop_bike_template_family.sql` (drop, after deploy).
- `src/app/admin/families/…` — CRUD page (copy `/admin/colors`), with a
  `sort_order` field like category admin.
- `src/app/admin/page.tsx` — add a "Families" tile under *Catalog & inventory*.
- Template create/edit form (`src/app/bike-templates/_actions/save-template.ts`
  + its form component) — replace the free-text family input with a `<Select>`
  of active families ordered by `sort_order`; store `family_id`.
- `src/app/bike-templates/page.tsx` — group by `family_id`, order sections by
  the family's `sort_order` (not alphabetical, `:94`), label from the joined
  family `name` (not `r.family`).

**Schema:** migrations 52 (additive) + 53 (drop `family` text, expand/contract).
**Effort:** ~75 min (30 min wait).
**Note:** batch with Items 2+3 — both are migrations touching the same build.

---

## Item 4 — Quantity at template pick-time
**Goal:** type the quantity while picking a part (e.g. "2" for a cable) instead
of adding qty 1 then bumping the stepper.

**Approach:** add a small number input to the picker row; change
`onPick(partId)` → `onPick(partId, qty = 1)`. Benefits all three consumers.

**Files**
- `src/components/recipe/category-checklist-row.tsx` — qty input; new onPick sig.
- `src/app/bike-templates/[id]/_components/parts-recipe-section.tsx` — use passed
  qty instead of hard-coded `"1"` (`:250-268`).
- `src/app/manufacturing-orders/[id]/_components/mo-parts-section.tsx` — same.
- `src/app/manufacturing-orders/[id]/bikes/[bikeId]/build/_components/build-workbench.tsx` — same.

**Schema:** none.
**Effort:** ~30 min (15 min wait). 4 files, one shared signature change.

---

## Item 5 — Template duplication (copy as a brand-new template)
**Goal:** "copy this whole template, change the frame, save as a NEW template" —
distinct from "save as new version" (which stays in the same version chain).

**Approach:** new action deep-copying the template + its `bike_template_parts`
into a fresh row: new `id`, `version = 1`, `is_current = true`, name
`"<name> (copy)"`, same `family`/`frame_size` (all editable after). Original
untouched. Redirect to the copy's edit page.

**Files**
- `src/app/bike-templates/[id]/_actions/duplicate-template.ts` — new; mirror the
  copy logic in `clone-as-version.ts` but write a new template instead of a
  version bump, and copy `bike_template_parts`.
- Template detail page header — add a "Duplicate" button (the detail page renders
  its header inline; place beside the existing version actions).

**Schema:** none.
**Effort:** ~45 min (20 min wait).
**Open Q:** name suffix "(copy)" ok? Land on the new template's edit view (rec).

---

## Item 6 — Historical / back-dated purchase date
**Goal:** entering old stock (e.g. baskets bought 2021), record the purchase date
so cost basis sits in the right period.

**Good news:** `inventory_movements.occurred_at` already exists (defaults
`now()`) — **no migration**. Just surface it.

**Approach (v1):** add an optional "Purchase date" field to the stock-adjust
dialog (default today); persist it to `occurred_at`. Covers the workflow — a new
part is created, then stock is added with a back-date. (The new-part form itself
holds no stock, so opening stock is naturally an adjust-stock step.)

**Files**
- `src/app/parts/[id]/_components/adjust-stock-dialog.tsx` — optional date input.
- `src/app/parts/[id]/_actions/adjust-stock.ts` — accept `occurredAt`, set it on
  the `inventory_movements` insert (`:98-105`).

**Schema:** none.
**Effort:** ~30 min (15 min wait).

**Phase 2 (optional, confirm):** Dennis also buys historically in USD/JPY and
wants "the correct dollar" auto-applied. `adjust-stock` takes DKK only today. A
phase 2 could add a currency picker + historical FX lookup by `occurred_at`
(reuse `lookupFxRate(currency, date)` already used by PO lines) so he enters the
original foreign amount and the system pulls the 2021 rate. Bigger UX change —
raise separately. **+~45 min (20 min wait).**

---

## Suggested build order
Fast no-schema wins first, then batch the two migrations at the end:
1. **Item 4** (qty at pick) — smallest, no schema.
2. **Item 6 v1** (back-date stock) — no schema.
3. **Item 5** (duplicate template) — no schema.
4. **Item 1** (supplier on part-create) — no schema.
5. ✅ **Item 7** (family controlled vocab) — SHIPPED (migrations 52 + 53).
6. **Items 2+3** (origin model) — migration 54; most surface area, do last.

Each is independently shippable (commit + push per repo convention). Total for
all seven ≈ **5.5–6.5 human-dev-hours**; phase-2 FX on item 6 optional on top.
