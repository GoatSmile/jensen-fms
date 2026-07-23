# Status — Jensen FMS

**Last updated: 2026-07-23, end of day** (people-&-roles build session:
P1 + P2 + P3 all shipped today, plus the August playbook).

This is the session-death recovery file: a fresh session (human or LLM)
resumes from `CLAUDE.md` + this file. **Overwrite it at session end — never
append.** History belongs in `docs/archive/`, decisions in
`docs/DECISIONS.md`.

## Where we are
- **v0.10.0+**, deployed on Vercel (push-to-`main` → prod), gated behind
  Vercel SSO. 73 migrations, single-tenant, solo-dev.
- **Operationally feature-complete** for the workshop's daily job: parts +
  categories + inventory ledger; suppliers + offerings; POs + additive
  frozen landed cost + email-to-supplier (test mode); bike templates
  (versioned, families); MOs + build workbench + batch build; bikes +
  lifecycle + QR; service orders (paint, on the generic external-services
  model); sales orders + slating automation; organizations/contacts/units +
  customer map; maintenance tickets + work orders; workshop floor (`/work`);
  invoicing 3D complete (WO/SO invoices, deposits/finals, credit notes,
  agreement fees); e-conomic push (verified end-to-end against a trial
  agreement); inbound voicemail → ticket pipeline **live in prod in shadow
  mode**; whole-app Danish i18n swept (locales still set to `en`).
- **People & roles P1–P3 shipped 2026-07-23** (migration 73 +
  `/admin/people`; role-password login + capability gating; tap-your-name
  `/whoami` + WO assignees + /work "Mine" + per-person worker language;
  design + per-phase notes in `docs/plan-people-roles.md`, mechanics in
  DECISIONS 2026-07-23). **No role passwords are set in prod**, so
  behaviour is unchanged until they are (the shared password now issues an
  owner-role session; legacy cookies stay valid).
- **`docs/PLAYBOOK-AUGUST.md`** — the owner-facing solo-August playbook
  (July item 7, together with the docs restructure).
- Inbound shadow-testing rides the US trial number **+1 762 500 0850**
  (the DK number +45 9370 3111 moved to Munin 2026-07-17). Dennis's company
  number remains the production plan.

## In flight / next action
- **Next: people & roles P4** (notification events — registry + the first
  delivery hooks; subscriptions are already admin-editable, so P4 is pure
  delivery work). Then the rest of the July queue below.
- **Open from the Jul-23 re-plan**: the ~1-hour perimeter check — confirm
  whether the public `/b`/`/report` pages ship the publishable key in
  their client bundle (anon_all RLS makes that key a master key; middleware
  correctly excludes those routes from the gate, verified today).

## July queue (re-sequenced 2026-07-17)
Frame: Dennis is back Aug 3, Nazar leaves Aug 4 — July output must be
self-serve for Dennis's solo August onboarding.
1. People & roles P1 ✅ P2 ✅ P3 ✅ (all 2026-07-23) → **P4** (next)
2. Voice commands VC-1 (`docs/plan-voice-commands.md`; owner deferred the
   VC-vs-August call — revisit after P4)
3. Inbound stats fold — deliberately thin (prod has only 2 shadow rows;
   real data starts when Dennis's number lands, August)
4. Global identifier search
5. Maintenance/workshop polish pass
6. Handover notes ✅ — docs restructure + `docs/PLAYBOOK-AUGUST.md`

## Waiting on (external)
- **e-conomic production agreement** grant token — expected ~end of July.
  Then: re-run Test connection, confirm journal / revenue account 1010 /
  U25 / payment terms with the revisor, then the first real push.
- **`orders@valent.dk`** alias (or catch-all) in Google Workspace — direct
  replies to PO emails bounce until it exists.
- **Supplier emails** — 18 still blank (dashboard housekeeping card).
- **Revisor nods pending**: weighted-avg stock valuation + deposit VAT
  timing (before the first real prepayment invoice); e-conomic config
  numbers (before the first real push).
- **Owner data entry** (debts below) + fill the CVR/bank/address
  placeholders in `src/lib/invoicing/company.ts` before the first real
  invoice (the print page warns until then).

## Deferred to mid-August with Dennis (agreed 2026-07-17)
Old-system data migration · invoicing-parity workshop + "paid" remark on
the e-conomic voucher · role-matrix refinement (against the people-roles
model) · e-conomic production cutover · supplier-email go-live (untick
`outbound_test_mode`) · leave-shadow-mode graduation · voice commands VC-3 ·
Dennis's company number onto the inbound trunk.

## Landmines
- **Before switching e-conomic tokens to production**: any
  `organizations.economic_customer_number` /
  `invoices.economic_voucher_id` / `economic_synced_at` stamped against the
  TRIAL agreement refer to trial entities and must be cleared first.
  Currently NONE exist — keep it that way (don't push real invoices to the
  trial).
- `outbound_test_mode` is the only thing between "Email supplier" and real
  supplier inboxes — verify it before demoing send flows.
- Both locales sit at `en`; if a surface suddenly renders Danish, someone
  flipped `app_settings` — that's the go-live switch, not a bug.

## Data-entry debts (owner/admin, not code)
Self-serve via the dashboard "Data housekeeping" fold:
- **Every part has `origin = NULL`** → new PO lines default to NO import tax
  (`import_tax_basis = 'unclassified'`) until origins are set on the part
  edit form. Classifying the China-sourced fast movers as `non_eu` restores
  tariff-by-default where it matters.
- **5 parts lack an HS code**: `JP-AND-M100-PWR`, `JP-AND-M100-CS`,
  `JP-AND-DSP-NTC`, `JP-SLFFH01B`, `JP-SP207- 27,2 350` — they snapshot 0 %
  tariff until classified. TARIC note: the customs broker (DA Custom
  Brokers) files some parts under favourable "for cycle manufacture" splits
  (e.g. 8714911077, 8714913072, 8714961010) to dodge the 48.5 %
  anti-dumping; our classification uses the standard splits — confirm with
  the broker before reclassifying. Anti-dumping (48.5 %) is set on
  8714963090 + 8714991099; it's origin-agnostic — fine while sourcing is
  ~all China.
- **Supplier offerings mostly lack `default_purchase_price`** → drafted POs
  land at 0 kr. with a "set price before placing" note.
- **No part has `reorder_point` / `reorder_quantity`** → the `/parts`
  reorder banner stays hidden until the owner fills them in.
- **Supplier country codes** were name-inferred (migration 25): Herrmans→FI,
  RYDE→NL, SAPIM→BE, Shimano Nordic→SE, MessingschKG→DE are best-guesses
  worth confirming.

## Standing "not now" decisions (reasons in docs/DECISIONS.md)
- **M1 auth + RLS tightening — DELAYED (owner's call).** RLS is ON across
  all tables (migration 50) with a permissive `anon_all` policy; only
  Vercel SSO protects prod. Do not start unless the owner re-prioritises.
  Agreed trigger to reconsider: **the first real invoice issued**. When it
  resumes: Supabase auth + login + middleware + user-scoped policies
  (written against `role_capabilities`) + a `DEV_AUTH_BYPASS` escape hatch;
  open decisions: sign-in method, role-model refinement.
- **CI smoke-test pipeline** — parked; build alongside auth (details in
  `docs/BACKLOG.md`).
- **Sales track** (configurator + lead-gen) — parked by the owner; earliest
  next year (`docs/BACKLOG.md`).
