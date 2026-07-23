# Decision log

Dated, append-only record of decisions locked with the owner (Dennis) or
made as deliberate dev calls: what was decided, why, and what was rejected.
**Never edit an entry — supersede it with a new one.** Doctrines that
constrain everyday code (money shape, config tiers, soft-archive
convention…) live in `CLAUDE.md`; this file is the "why" trail behind them.

New rule (2026-07-23): when a decision is locked, its entry lands here **in
the same commit** as the code that implements it.

## 2026-05 — Founding modeling decisions
Money is always `(amount, currency)`; FX + transport % + tariff % are frozen
onto the PO line at purchase; landed cost is additive and DB-generated;
catalog (`parts`) is separate from inventory (movements; stock = SUM of
deltas, never a stored field); product entity = versioned `bike_templates`
(models/variants collapsed, migration 09); per-bike `bike_parts` is the
build-time source of truth. Full statements live in CLAUDE.md
"Architectural decisions".

## 2026-06-19 — Dennis app-review call #1: scope + vocabulary calls
First slice = core daily flow. RAL + coating extend the controlled `colors`
table — NOT free-text on the order line. Payments & stock value deferred to
their own session. PO email via **Resend** (from `deej@jensenproduction.dk`
— sending domain superseded 2026-07-08, see below).

## 2026-06-20 — Navigation / IA set with owner
Grouped left nav, most-used first: Dashboard · Daily ops · Orders &
commercial · Admin. The customer Map lives under `/admin`, not the sidebar.
Layout details in CLAUDE.md Conventions.

## 2026-06-20 — Build-flow gates (Tier 2, D1–D4)
- **D1** — `bikes.frame_number_confirmed` flag separates a confirmed real
  frame from the provisional auto-generated placeholder; flips only at the
  deliberate "Confirm frame" step.
- **D2** — "at painter" is DERIVED (bike ∈ open paint order), not a bike
  status/column; `received_back` frees bikes automatically, no trigger.
- **D3** — `paint_orders.sales_order_id` link; "paint from SO" picks an
  explicit SUBSET of frames, back-linked both ways.
- **D4** — no silent MO auto-complete; completion is a one-click "Complete
  MO"; bulk build SKIPS gated bikes instead of bypassing gates.

## 2026-06-20 — Labeling note is per-SO, not per-line
Chose `sales_orders.production_note` (migration 46) over a per-line note —
it reaches every bike via bike→MO→SO regardless of how the MO was created,
and matches the order-level use case (municipal labeling). Editable
mid-production; distinct from commercial `sales_orders.notes`.

## 2026-06-21 — Prepayments & stock-value model (owner call)
**Revisor nod still pending before the first real prepayment invoice**
(weighted-avg valuation + deposit VAT timing).
- VAT (25 %) is recognised **at payment time** (Danish momsloven: payment
  ahead of delivery sets the tax point); same rule for both deposit kinds.
- Every prepayment is its own numbered deposit invoice (acontofaktura);
  installments allowed.
- Two deposit kinds: **(A)** amount/% on account (single summary line);
  **(B)** specific parts paid up front (itemised part lines).
- The final (slutfaktura) bills the **remaining balance only**:
  `order total − Σ(deposits)`, referencing the deposits — never a fresh
  full invoice (avoids double-counting VAT).
- Part-based deposits (B): the paid parts are not re-charged on the final
  AND are excluded from stock valuation while physically in stock. The
  deposit's `part_id` lines ARE the customer-paid record (no extra flag).
- Stock valuation = **weighted-average cost** of on-hand minus
  customer-paid parts (FIFO was the alternative).
- Delegated defaults (owner: "pick the most likely"): deposits/final
  inherit the order's VAT code; VAT lands in each deposit's period; EAN
  transmission like any invoice (with 3E).

## 2026-06 — Invoicing number + immutability rules
The sequential INV number is allocated **at issue** (drafts carry a
`DRAFT-xxxx` placeholder; abandoned drafts never burn a number). Issued
invoices are immutable — un-issuing doesn't exist; corrections are credit
notes. Credit notes are **full reversals only**, drawing from their own
`CRE-yyyy-xxxx` series; the original flips to `credited` and its WOs/SO
return to the uninvoiced pool. Agreement fees: billed **in arrears** (fully
elapsed months only), **one invoice per customer** (one line per
agreement-month), **pro-rated by days** for partial months.

## 2026-06-24 — RLS on with permissive policy; M1 auth delayed
RLS enabled on all 55 tables (migration 50) with a permissive `anon_all`
policy — the boundary is explicit, behaviour unchanged. The auth layer
itself (M1) is **deliberately deferred** (owner's call); agreed trigger to
reconsider: **the first real invoice issued** — financial records behind
SSO-only is the line. The CI smoke-test pipeline was parked the same way
("I like the discipline" — manual browser verification is the safety net);
build it alongside auth, since auth touches every page.

## 2026-07-02 — Dennis call #2: no inline part creation from the PO screen
Keep part creation on the parts screen (owner + dev agreed). Everything
else from the call shipped by 2026-07-08 — see
`docs/archive/plan-july2-meeting-backlog.md`.

## 2026-07-08 — Config vs secrets; sending domain switched
Operational identifiers (emails, phone numbers, domains, DNS values —
public data) live in admin config (`app_settings` + `/admin/settings`);
only real secrets (API keys/tokens) live in env vars. Sending domain
switched from `jensenproduction.dk` to the dev's **`valent.dk`** (Dynadot
DNS, Google Workspace mail); from/reply-to refined to `orders@valent.dk`
(mailbox to be created before go-live). The DB is the truth for these
values.

## 2026-07-08 — Import-tax origin model; the basis is frozen
Per-PO-line "Apply import tax" checkbox defaulting from
`origin = 'non_eu' AND NOT supplier prepaid`. The *reason* for a zero is
snapshotted (`purchase_order_lines.import_tax_basis` enum) because a
derived reason can't be reconstructed later without reading mutable
part/supplier/HS state — reconstructing would fabricate history and break
frozen-at-purchase. Unclassified origin ⇒ NO import tax by default
(owner-confirmed: "initially without tariff, click to add"), flipping the
old always-apply-HS-tariff default.

## 2026-07-09 — e-conomic integration shape
Issued invoices push as **draft journal vouchers** (`manualCustomerInvoice`
entries in the kassekladde), NOT as e-conomic invoices — the FMS owns the
INV number series; e-conomic issuing its own numbers would fork it. The
bookkeeper reviews + books. VAT amounts are deliberately NOT passed
(e-conomic derives from the VAT code — avoids sign-convention bugs). Credit
notes push as negative entries without the `customerInvoice` int (the int
is derived from INV digits; CRE would collide). Customers auto-create on
first push; the assigned number is stored locally
(`organizations.economic_customer_number`).

## 2026-07-09 — Dashboard doctrine + history backfill
Owner's hard requirement: **no busy screen** — sections whose data is too
thin to be useful must fold away (FoldSection, data-aware defaults, header
keeps a one-line summary). Backfill approved: `legacy_monthly_stats` covers
pre-system months only (boundary: backfill ends 2026-04, live capture
starts 2026-05); known limit — agreement bikes only, undercounts one-off
sales; serviced/revenue columns left 0.

## 2026-07-09/10 — External services: "go all the way to service_orders"
Owner approved remodeling paint into a generic external-services model
(`service_types` / `service_orders` / price lists, migrations 61–64) rather
than patching paint_orders. Nav/routes stay **per service type,
permanently** — no unified list page. JP-lak service SKUs retired
(soft-deleted; ledger zeroed additively, migration 62).

## 2026-07-09 — Sales track parked (owner's call)
Website configurator + lead-gen agent: "lay the bottom first" — earliest
next year, debt down first. Entry in `docs/BACKLOG.md`.

## 2026-07-11 — Price-list grid: deliberate non-builds
No xlsx import/parse (wait for the 2027 price file to exist — the revision
editor covers the yearly bump as a 5-min clerical task) and no
tier-boundary editing in the UI (rare; SQL job).

## 2026-07-11 → 2026-07-14 — i18n mechanism + boundaries
next-intl **without URL routing**; locale from `app_settings`, resolved per
surface (worker surfaces → `worker_language`, everything else →
`app_language`). Server-action errors localized **at the source** via a
flat `errors` namespace; verbatim DB/API messages ride along as `{detail}`.
Controlled-vocab names render via `localizedName` (the schema was already
bilingual — no migration, no data entry). Deliberately English: product/
template/family names, org identity, HS descriptions, kit sticker colours;
customer-facing documents keep their own per-document language (invoice
print per `invoices.language`; PO print always English). Full sweep
narrative: `docs/archive/i18n-danish-sweep.md`.

## 2026-07-14 — Configuration doctrine formalized (three tiers + registry)
Standing rule promoted to doctrine (CLAUDE.md): secrets → env; operational
config → `app_settings`; vocabulary → controlled-vocab tables. A "provider"
is an adapter behind a stable interface; config selects among BUILT
adapters + holds their params — it can never conjure an unbuilt
integration. The last hardcoded config knob (`DEFAULT_PAINTER_NAME`)
migrated to `service_types.default_supplier_id` (migration 67).

## 2026-07-14 — Inbound is a generic trunk (dev decision)
Voicemail is the first channel of `inbound_messages` (NOT a `calls` table):
channel enum, normalized `body_text` read exclusively by extraction +
matching (never the channel payload), `channel_meta` jsonb, and a plain
`ticket_id` action column — no polymorphic action framework until a second
action type is real. Harness-first build (upload-a-voicemail test UI before
any telephony). Extraction emits `intent` from day one — later it's the
routing key.

## 2026-07-16/17 — Inbound providers locked + number ownership
Providers: Twilio (fetch-and-delete recordings), **Gladia** transcription
(replaced the planned Azure Speech), Claude haiku extraction, GatewayAPI
SMS. Number move 2026-07-17: **+45 9370 3111 belongs to Munin**; Jensen
shadow-testing rides the US trial **+1 762 500 0850**; Dennis's company
number is the production plan.

## 2026-07-17 — July re-sequenced + people & roles design locked
Remaining July (→ Aug 3) priority: people & roles P1–P2 → voice commands
VC-1 → P3–P4 → inbound stats fold → global identifier search → polish →
handover notes. People & roles locked with owner-dev: one scrypt password
**per role** (the password IS the role selector — no picker); explicitly a
**UX wall, not a security boundary** (perimeter stays Vercel SSO until M1;
at M1 the role passwords die and the model survives — RLS policies will be
written against `role_capabilities`); workshop role SEES costs (no
redaction pass); sales role is real; tap-your-name self-claim unverified is
fine; no temp automation. Design: `docs/plan-people-roles.md`.

## 2026-07-17 — Voice-command action tiers
Model proposes / code disposes; never guess-create (open slots instead).
Tier A = draft-creating actions that wrap existing server actions; Tier B
(stock receipt, status transitions) = explicit confirm; Tier C (issue
invoice, emails, deletes, payments) = **never by voice**. Review-first with
measured graduation to auto-apply. Design: `docs/plan-voice-commands.md`.

## 2026-07-23 — Documentation restructure (handover-readiness)
CLAUDE.md reduced to durable rules only (budget ~450 lines; test: "would a
fresh session behave incorrectly without this line?"). Short-shelf-life
content tiered into `docs/`: STATUS.md (overwritten at session end),
DECISIONS.md (this file), OPERATIONS.md, BACKLOG.md, archive/. New rituals:
session-end STATUS update; decision entries land in the same commit as
their implementation. Repo README replaced (was create-next-app
boilerplate).

## 2026-07-23 — Role-session mechanics (people & roles P2, dev calls)
The role-login cookie is **self-contained**: an HMAC-signed payload
carrying `{role, caps, home}` frozen at login — Edge middleware does route
gating with zero DB reads. Consequence (accepted): capability/home edits
in admin apply at the **next login**, not live. The HMAC key derives from
`SITE_PASSWORD` + a pepper — no new env var; rotating the shared password
invalidates all sessions (correct in a shared-secret world); the whole
credential layer dies at M1. Cutover compatibility: the legacy 64-hex
shared-password token stays valid as **owner-equivalent full access**, and
entering `SITE_PASSWORD` at login now issues an owner-role session — no
one gets locked out by the deploy. If two roles were ever given the same
password, lowest `sort_order` wins (admin can't detect collisions —
hashes aren't comparable); don't do that. Rejected alternatives: DB
lookup per request in middleware (Edge latency + coupling), a separate
`AUTH_SECRET` env var (more setup surface for a layer M1 deletes).

## 2026-07-23 — Tap-your-name mechanics (people & roles P3, dev calls)
The claimed person is **re-signed into the session cookie** (same
self-contained pattern as P2 — no DB in middleware); claiming is skippable
and switchable any time via the nav person chip. Assignment shipped for
**work orders only**: tickets have no assignee column (the design's
"WOs/tickets" resolved to what the schema actually carries), and the MO
`assigned_to` FK stays ready but picker-less until a real use appears.
A claimed person's `preferred_language` now supersedes the shared
`worker_language` on worker surfaces — the "per-user at M1" i18n note
arrived early, at zero migration cost.
