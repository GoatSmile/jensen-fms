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

## 2026-07-23 — Notification delivery mechanics (people & roles P4, dev calls)
Events fire per the design (role_notifications → active people → per-person
channel flags). Dev calls made building it:
- **Self-contained log, not a queue.** `notification_log` (migration 74)
  records every provider-accepted send; it doubles as the idempotency key
  for STATE-SCAN events (invoice.overdue asks "already logged for this
  invoice?"). Action-fired events (ticket.created, wo.assigned) fire once
  by construction and use the log purely as audit.
- **Fire-and-forget, never blocking.** `notifyEvent`/`notifyDigest` swallow
  every failure and return counts — a bounced email must never fail the
  ticket save or the assignment that triggered it.
- **Email rides the existing test-mode reroute** (resolveRecipients), same
  as the PO email: while `outbound_test_mode` is on, everything reroutes to
  the test inbox with an intended-for banner + [TEST] subject. So P4 is
  safe to ship with real subscribers before go-live.
- **Copy lives with the hook, not in messages/*.** Notification emails are
  per-recipient documents in the recipient's `preferred_language`
  (src/lib/people/email-content.ts), not app chrome — same rule as invoice
  / PO document generators.
- **invoice.overdue is a daily digest, notified ONCE** when first seen
  overdue (not re-nagged daily — the dashboard money band is the standing
  reminder). wo.assigned is person-targeted and skips self-assignment.
- Shipped hooks: ticket.created (app + inbox create paths → workshop),
  wo.assigned (→ the assignee), invoice.overdue (daily cron → owner +
  accountant). SMS/Web Push deferred (channel flags exist; only email
  delivers today).

## 2026-07-23 — Voice commands VC-1: build the in-app slice, text-first (Option A)
The owner chose the **middle path** over both "full VC-1 now" and "defer
everything": build the in-app dictate slice (dictate → agent → resolvers →
three draft actions → Inbox review), and **skip the phone/telephony
staff-number routing fork** — that folds in with VC-3 in August when
Dennis's number and Dennis are both real. Rationale: the phone fork is the
most time-consuming, least-valuable-right-now piece (a live Twilio seam for
a line that isn't Dennis's yet), and the in-app slice is exactly the part
the owner can dogfood at their desk before leaving Aug 4 — so August is
tuning, not building.

Deliberate deviations from `docs/plan-voice-commands.md` (the agreed design),
for this slice only:
- **Ingress is TEXT, not audio→Gladia (Option A).** The design specified
  MediaRecorder → Gladia "for phone parity, one pipeline." For the in-app
  slice we take dictated/typed TEXT straight to the agent (reusing the
  existing Web-Speech `DictateButton` for voice→text + a textarea). No audio
  upload, no bucket, no transcription cost — fastest to dogfood, Chrome/
  desktop for the voice part (fine, it's the owner at a desk). The audio
  path is NOT abandoned; it arrives with the phone face in VC-3, and both
  converge on the identical agent + review surface, so nothing here is
  wasted. New `in_app` value on the `inbound_channel` enum (migration 75)
  is the natural consequence.
- **`kind` values are `'customer'` (default) / `'command'`** exactly as the
  design sketch (migration 76), so the future phone fork keys off the same
  column with zero churn.

Mechanics (all in migration 76 + `src/lib/inbound/command/*`):
- **The model proposes, code + a human dispose.** The agent
  (`command/agent.ts`) is a Claude tool-use LOOP on the same Anthropic
  plumbing as extract.ts (thin fetch, key from env, model from
  app_settings — reuses the extraction model), calling read-only RESOLVERS
  (`command/resolvers.ts`: search_customer, resolve_customer_segment,
  resolve_template, resolve_color, search_part, resolve_part_via_recipe) to
  ground every reference, then emitting a `propose_plan`. It NEVER invents:
  an unresolved template/part/colour is left null and becomes an OPEN SLOT
  the reviewer fills; only CUSTOMERS may be offer-to-created.
- **`command_plan` (jsonb) holds proposals; `command_actions` logs applies.**
  parseCommandPlan (`command/plan.ts`) is the contract enforcer (à la
  parseExtraction); open slots are DERIVED from the typed fields, never
  trusted from the model. One `command_actions` row per applied action
  (provenance + a unique (message, action) index = idempotent apply).
- **Apply wraps pure draft-writers.** `insertDraftOrganization` /
  `insertDraftSalesOrder` (`src/lib/commercial/draft-writers.ts`) are the
  redirect-free, FormData-free cores mirroring the interactive
  save-organization / save-so + manage-so-lines rules; draft PO reuses
  `createDraftPOsForDemand` as-is. A sales order that references a
  just-proposed new customer requires that customer's action applied first
  (dependency enforced in the panel + the apply action).
- **Command rows SKIP triage** (a staff command from an unknown number would
  score as spam) — the agent is the whole pipeline for `kind='command'`.
- VC-1 sales orders carry a SINGLE template line (the founding utterance);
  multi-line voice orders + forcing a named PO supplier are VC-2 notes.
Verified end-to-end in-browser (founding utterance → customer + SO drafts,
dependency ordering, grounded summary). Scope/phasing unchanged in
`docs/plan-voice-commands.md`; VC-2/VC-3 as written there.

## 2026-07-25 — One docs scheme shared with Munin

The docs restructure of 2026-07-23 (entry above) worked: this project's files
have not re-accreted since. Munin independently hit the same wall two days
later — its `CLAUDE.md` had reached 812 lines and contradicted itself in nine
places, four of them phrased as live instructions. Rather than solve it twice,
**both projects now use one scheme**, so the session rituals and muscle memory
transfer between them.

The principle, stated explicitly because it is what makes the scheme work:
**organize docs by shelf life and write discipline, not by topic.** Accretion is
not a discipline failure — it is the default for any file with no stated write
rule. Every file therefore declares its own: overwrite (STATUS) · append-only,
supersede-never-edit (DECISIONS) · delete-when-shipped (BACKLOG) ·
names-not-values (OPERATIONS) · write-once (archive) · edit-in-place with a line
budget (CLAUDE.md).

Seven slots, one job per file. A file filling two slots is the bug.

Changed here (Munin adopted the rest, which this project already had):
- `docs/archive/shipped-history.md` → **`docs/archive/HISTORY.md`** — same name
  in both repos. Worklog rows before today use the old name; a note in the file
  records the rename.
- `docs/OPERATIONS.md` gained a **Scheduled jobs** section. It had none, despite
  three live Vercel crons — and the FX-refresh one matters most: a stale ECB rate
  freezes onto new PO lines, so the money math degrades silently and, because
  frozen-at-purchase is deliberate, **not retroactively fixable**. A bus-factor
  document that omits the job whose silent failure corrupts cost basis is missing
  the thing it exists for. Also added a full env-var inventory (nine variables
  were unnamed, deferred to the provider registry) and two absent external
  systems (ECB, OpenStreetMap Nominatim).
- `docs/STATUS.md`'s header had started accreting a "Previously: …"
  parenthetical, against its own overwrite-never-append rule. Trimmed, and the
  rule now says explicitly that it covers the header.
- `migrations/README.md` + `CHANGES.md` describe the **May-2026 proposed** schema
  package ("v1.2", two files) while the live schema is 73+ numbered migrations.
  Banner-marked historical rather than moved, since they still explain the
  founding table design and the bilingual mechanism and they belong next to the
  files they describe.

Rejected: renaming Munin's `STATE.md` to something new in both repos (Jensen is
older and has more docs — the cheaper migration wins), and deleting the narrative
histories (the rationale is their whole value; the accretion problem was never
that history existed, only that it loaded every session).

Time for this work is logged in Munin's worklog, where the audit was driven from;
not double-counted here.

## 2026-07-25 — Rituals get enforcement, not willpower

The rule added two days ago — "when a decision is locked, its entry lands here in
the same commit as the code" — had already slipped: decisions were made on 07-25
(the provider verdict, the AI-receptionist tier) with no entry here until this
one. Separately, a `git add -A` in this repo swept an unrelated working-tree
change into a docs commit and pushed it to `main`, which deploys.

Conclusion: **a rule with no enforcement mechanism decays.** Three hooks now live
in `.claude/hooks/`, tracked, and shared with Munin (identical scripts; the
CLAUDE.md budget differs per repo):

- **`gates.sh`** (PreToolUse, `git commit*`) — refuses the commit unless
  `tsc --noEmit` and `next build` pass. Runs `npm test` only where a test script
  exists, so it is a no-op here until the CI/Vitest item in BACKLOG.md lands.
  Docs-only commits skip everything; the build is skipped while a dev server is
  listening, since building then corrupts `.next` and produces phantom hydration
  stalls — the trap already recorded in WORKLOG.
- **`git-add-guard.sh`** (PreToolUse, `git add*`) — blocks `-A` / `--all` / `.`
  and prints everything dirty. Explicit paths only.
- **`claude-md-budget.sh`** (PostToolUse, Write|Edit) — flags CLAUDE.md past its
  budget. It fired immediately: this file was at **457 against its stated ~450**.
  Budget raised to ~470 rather than cutting invariants, because the overage is the
  per-file write rules moving inline — structural overhead, not narrative. That
  distinction is the whole point of having a number.

`settings.json` also gained the durable read-only permissions. Note for the
record: `settings.local.json` had accumulated **171** allow entries, ~150 of them
one-off grants (62 distinct `curl` invocations, one rule per past commit message)
— noise that will never match again. It also holds live Trello credentials in
plaintext and `apply_migration` pre-approved; both were left there deliberately,
since the file is gitignored, but Trello appears nowhere in OPERATIONS.md's system
inventory and should either be documented or removed.
