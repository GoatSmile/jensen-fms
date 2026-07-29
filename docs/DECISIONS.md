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
inventory and should either be documented or removed. *(Both dispositions
SUPERSEDED 2026-07-25 — the Trello integration was removed, the allow-list was
pruned 171 → 17, and the `apply_migration` pre-approval was dropped. See the
last two entries.)*

**Session rituals became skills, same day.** `/session-start`, `/ship-it` and
`/log-decision` in `.claude/skills/` hold the full procedure; `CLAUDE.md` keeps only
the triggers and invariants, since a procedure nobody knows to invoke is worse than a
verbose one. This buys **consistency more than context**: the saving is a few lines,
but the checklist is now identical every time — including the steps most often
skipped here, namely en/da parity, moving a closed plan to `docs/archive/` with its
references repointed, and re-checking STATUS's Landmines section.

## 2026-07-25 — Docs audit: measure the thing that actually fails

An audit of every doc, run hours after the scheme + hooks landed, on the theory
that a scheme is only worth what its first re-read proves. Six defects, and the
interesting ones were **rules that measured the wrong quantity**.

- **The worklog rule measured lines, and the failure was characters.** *"One line
  per row — an hours ledger, not a diary"* could never fire: the Jul 16 row is
  5,927 characters and is still one line. May/June rows sat at 250–400; July rows
  ran 4–6k. The rule is now **~300 characters, hook-enforced**
  (`worklog-row-budget.sh`), and the seven bloated rows were compressed — their
  narrative was duplicated into `docs/archive/HISTORY.md` in the same pass, so
  nothing was lost. **Rejected:** leaving history alone and capping only new rows —
  a hook that flags 14 historical rows on every save is a hook you learn to ignore,
  which is how the last rule died.
- **HISTORY.md had stopped absorbing.** It ended at "People & roles P1" while nine
  shipped items sat unrecorded, which is *why* STATUS.md had swollen to 206 lines
  of narrative — reduce-don't-grow only works if the destination is written.
  Backfilled 07-23 → 07-25 with commit refs. The lesson for `/ship-it`: STATUS
  getting long is not a STATUS problem, it is an unwritten-HISTORY problem.
- **`docs/PLAYBOOK-AUGUST.md` was an eighth file in a seven-slot scheme.** Its own
  rule says "a file filling two slots is the bug" but said nothing about a file
  filling *none*. Resolved by naming the class rather than growing the scheme:
  owner-facing dated deliverables are **not slots** — rewrite on period change,
  archive when the period ends. **Rejected:** an eighth slot (the scheme is shared
  with Munin, which has no such file) and archiving it (it describes a period that
  hasn't started).
- **Trello went into OPERATIONS as dev tooling, not as a system dependency.** The
  previous entry said it "should either be documented or removed", which framed it
  as a missing inventory row. It isn't: nothing in `src/` touches Trello, and
  putting it in the app-dependency table would assert a dependency that doesn't
  exist. New "Dev-environment tooling" section instead, explicitly marked as not
  required to run or deploy. Verified while writing it: the token is **live,
  non-expiring, and read+write across Member/Board/Organization** — account-wide,
  not board-scoped — so the entry says to rotate and scope it at handover.
  *(SUPERSEDED same day — the integration was removed outright rather than
  rotated; see the last entry.)* Also recorded there: the hooks need `jq` on
  PATH or they exit silently and the gates stop gating with no warning.
- Smaller: STATUS claimed 73 migrations against 78 while citing 75/76 in its own
  body; `plan-voice-commands.md` still read "not yet built" three days after VC-1
  shipped; CLAUDE.md stated its own organizing sentence twice; and blank lines
  between WORKLOG rows had been silently splitting the July table into fragments.

The through-line: **every one of these was a doc claiming something the repo
could have contradicted on inspection.** Cheap to check, and none of them
surfaced on their own — which argues for re-reading the docs against the repo
periodically, not only when writing them.

## 2026-07-25 — Remove the Trello API integration (SUPERSEDES the "document or rotate" plan)

Supersedes the disposition in the two entries above, which said to document
Trello in OPERATIONS and rotate its token. **The integration is removed
instead**: credentials deleted from `.claude/settings.local.json`, the
reference memory dropped, OPERATIONS updated to record the removal.

Why the reversal. Rotation would have bought a scoped, expiring token for a
capability with **no demonstrated use** — nothing in `src/` ever called
Trello, no workflow depended on scripted board access, and the boards are
worked by hand in the browser anyway. That is a standing credential and a
monthly rotation chore maintained for an integration nobody was using. The
smallest secure system is the one without the credential in it.

What was explicitly **not** removed: the boards themselves. "Jensen 1"
(kanban) and "Jensen – Phase 2" (roadmap) are live, shared with Dennis, and
untouched — this removed *programmatic access*, not the team's task
tracking. Worth stating because "remove the Trello integration" could
reasonably have been read the other way, and the destructive reading is
unrecoverable.

**Rejected:** rotating to a 30-day scoped token (keeps a chore alive for an
unused capability); leaving it as-is with a handover note (a non-expiring
account-wide read/write token is the wrong thing to hand over); deleting the
boards (never asked for, and Dennis's items live there).

The general rule this is an instance of: **an unused integration is not
neutral — it is a credential you are choosing to keep.** When an audit finds
one, removal is the default and rotation is the exception that needs a
reason.

## 2026-07-25 — Prune the local allow-list 171 → 17; drop the apply_migration pre-approval

`.claude/settings.local.json` is gitignored personal config, so this is
recorded here only for the one part that changes how the project is worked:
**`apply_migration` is no longer pre-approved.** Applying a migration now
shows the SQL in a permission prompt first. There is one Supabase project and
no staging, so the pre-approval meant unreviewed DDL could reach production
with nothing in front of it — the same class of failure as the `git add -A`
that produced `git-add-guard.sh`, and the only one of the three hooks' worth
of risk that had no guard. Cost is one click per migration. **Rejected:**
keeping it for speed (the prompt is cheap and the failure is not), and
building a staging project (real fix, disproportionate today).

What the prune removed, for the record: 62 one-off localhost `curl` probes
(superseded by browser-verification), 18 `python3 -c` / `pip3 install` grants
including a blanket `python3 -c ' *`, 12 rules each matching one past commit
message, 8 paths that no longer exist, 5 duplicates of `settings.json`, and
~50 single-use `sed` / `grep` / `mkdir` / `kill` entries. None can ever match
again. A stale `mcp__Claude_Preview__preview_start` was replaced with the
current `mcp__Claude_Browser__preview_start`.

What survived is broad on purpose, because a **hook** stands behind each one:
`Bash(git add *)` is safe because `git-add-guard.sh` denies `-A`/`--all`/`.`
regardless of the allow-list, and `Bash(git commit *)` is safe because
`gates.sh` refuses the commit unless tsc + build pass. Verified both, rather
than assumed: the guard still denies a blanket add with the broad allow in
place.

The durable lesson: **an allow-list that accumulates one-off grants stops
being a policy and becomes a log.** 150 of the 171 could never match again,
which made the ~20 that mattered unreadable — the same accretion failure as
the 812-line `CLAUDE.md`, in a file nobody thought to re-read because it is
gitignored. Prefer a small list of broad rules each backed by a hook over a
long list of narrow ones backed by nothing.

## 2026-07-26 — A SessionStart hook for the hours ledger

The worklog ritual had the one property this project keeps proving fatal: its
trigger was *noticing*. `/session-start` fires when the user types it or when
the assistant recognises "first exchange of a new working day" — and today it
recognised neither. A session opened with a docs question, ran four commits,
and never logged a row. **The ledger was only saved because a parallel session
happened to run its own session-end ritual and reconciled the day.** That is
luck, and luck is not a process.

`.claude/hooks/worklog-session-check.sh` (SessionStart) now states the ledger's
state at the moment the ritual is meant to fire: whether today has a row, what
the last row was, and — the case that actually bit — whether commits have
already landed today without one.

Design constraints, because a nagging hook gets ignored and then removed:
- **Silent when today has a row.** The common case costs nothing.
- **Facts, not tasks.** CLAUDE.md already rules that a day without a row means
  you didn't work, so a missing row is reported, never demanded. The
  no-commits wording says outright that no row may be correct.
- **Cannot block.** SessionStart hooks are informational by nature; the worst
  failure mode is silence.

Both branches were verified by simulation (row removed → the commits-landed
message; commits forced to zero → the quiet-day message), and the worklog was
restored to a clean diff afterwards.

**Rejected:** blocking a commit when today has no row — it would fire on
docs-only and quick-fix days and would be trained away within a week; and
auto-writing the row from commit timestamps, because hours are the user's to
state and an invented estimate is worse than an absent one.

This completes the pattern started 2026-07-25: every ritual in this project
that used to depend on memory — commit gates, blanket adds, the CLAUDE.md
budget, worklog row size, and now the worklog row itself — has a mechanism
behind it. The remaining honour-system rule is the DECISIONS "same commit as
the code" one, which is unenforceable by a hook because only a human knows a
decision was made.

## 2026-07-26 — Model selection: discover it, don't type it (owner call)
The extraction model was a **free-text box** (`inbound_extraction_model`,
default `claude-haiku-4-5-20251001`). A typo or a retired id doesn't fail at
save time — it fails inside the pipeline as a generic `api_error`, and in
shadow mode nobody sees that for days.

Owner's question was "do I just type in the name of the model?", and the
answer is now: either. `src/lib/inbound/models.ts` fetches the live catalogue
(`GET /v1/models` — id, display name, context window, output cap), the admin
picks from it, and a **Test** button proves the pick with a real forced
tool-use call before it can be relied on. Verified in-browser against the
live API: 10 models listed, and `claude-sonnet-9-nope` returns a visible 404
at pick time instead of silently later.

Three rules the implementation encodes, because "how do we pick correctly
when we upgrade?" is the durable question behind the immediate one:
- **The list is live, never a hardcoded array** — a new model is selectable
  the day it ships, with no code change and no deploy.
- **Aliases beat dated snapshots.** `claude-sonnet-5`, not
  `claude-sonnet-5-20xxxxxx`: aliases roll forward, snapshots pin and
  eventually retire. The picker sorts aliases first and labels snapshots.
- **Free text is never removed.** Discovery failing (no key, offline, a
  provider with no catalogue endpoint) falls back to typing an id — discovery
  is an aid, not a gate. This is also why `/v1/models` is provider-scoped:
  it does not exist on Bedrock/Vertex/Foundry, so a future adapter brings its
  own lister.

**Model moved to `claude-sonnet-5` for BOTH jobs** (owner: "move all to
claude-sonnet-5"), so the proposed split into a second `inbound_command_model`
setting was **rejected as premature** — one setting, relabelled to say it
drives extraction *and* the command agent. The split stays available if the
two ever diverge. Sized for the harder job: the command agent is a 6-resolver,
up-to-8-iteration tool loop, where Haiku was under-powered. Cost is not the
constraint at this volume (Haiku $1/$5, Sonnet 5 $3/$15 per MTok) — capability
is. Price is deliberately NOT read from the API, because the API doesn't
publish it; that stays a human judgement.

## 2026-07-26 — Sales leads reuse the command agent, not a new action system
An `order_inquiry` reaching `/inbox` could only be "logged as handled" — so
the highest-value call the shop can receive (the 25-Jul Gladsaxe test call:
~25 bikes for hjemmeplejen, October, plus a recurring service agreement) left
no customer, no order and no trace. The code comment admitted it: *"a sales
lead the inbox tracks until the offers module exists."*

Decision: **an inbound sales enquiry is an implicit staff command**, so
`planFromInquiry` phrases the call as a task and hands it to the VC-1 command
agent. The reviewer gets the same CommandPlanPanel — proposed DRAFT actions,
open slots, applied one at a time, nothing auto-written. Rejected: a second
bespoke lead-action system (duplicates the resolver + apply + provenance
machinery), and building the offers module now (still parked behind the sales
track in BACKLOG.md).

Two mechanics worth keeping:
- It writes **only** `command_plan`. `status`, `error` and `processed_at`
  belong to extract → match → triage and must not be rewritten by the planner
  — unlike the command path's `runAndStorePlan`, which owns those fields.
- It carries the same **re-plan lock** as `rerunCommandAgent`: plan action ids
  are positional, so re-planning after an apply would repoint existing
  `command_actions` rows at different actions and corrupt provenance.

The task text passes the raw transcript *and* the extraction as hints, and
tells the agent when clarity is low (below 0.6) to leave fields null rather
than guess. Verified on the real 0.37-clarity Danish call: it resolved
Gladsaxe Kommune as an existing customer, split three sales-order lines by
bike type, set October delivery, left every template id as an **open slot**
citing the poor transcription, and reported in `notes` that the service
agreement can't be drafted and needs follow-up outside the system. Known gap:
`quantity` is a filled field, not an editable slot, so per-type counts the
caller never stated ("nogle få", "et par") land as 1 and are fixed on the
draft after applying.

## 2026-07-26 — Owner's copy of the system: AES-256, and the bigger question
Off-site copy goes to Jensen's **on-site NAS**, as an **AES-256** archive
(owner's call). The backup kit's existing `secure.sparsebundle` is AES-256 and
correct but **macOS-native** — a NAS can store it and nobody there can open
it, so the Dennis copy is produced as an AES-256 `.7z` instead: cross-platform,
and every IT person he might call already knows it. Archive password lives in
Jensen's own password manager, never beside the archive.

The point that matters more, recorded so it doesn't get lost behind the
backup task: **every account is in the dev's name** (GitHub, Vercel, Supabase,
Twilio, Resend, Anthropic, Dynadot DNS). A perfect backup gives Jensen the
data and the code, not a running service or a phone number. Own decision at
the 19-Aug session: migrate to Jensen-owned org accounts, or a written
arrangement with credentials in a shared vault. Plan: `docs/plan-cutover.md`.

## 2026-07-26 — Design direction: Emalje in Geist, grouped nav, remembered state
Owner reviewed the two directions rendered side by side
(`docs/mockups/design-directions.html`) and locked:

- **Direction B — "Emalje"** — the colour / shading / flat-fill system, with its
  pill buttons. **Direction A ("Værksted")** — warm paper ground, hairline rules
  instead of boxes — **rejected.**
- **Keep Geist.** No display face. Fraunces and Bricolage Grotesque both
  rejected; heading contrast comes from weight and size alone.
- **Keep the "Ægte Jensen · KVALITETSCYKLER" wordmark** as set in the mock-up.
- **Seven grouped nav items**, not fourteen flat ones.

The consequence to hold onto: dropping the display face puts the entire visual
identity on colour, shading and shape. That *raises* the stakes on the hue
vocabulary rather than lowering them — there is no typographic fallback if it
drifts. B's six hues supersede the four-hue section-tint vocabulary currently
documented in CLAUDE.md; the two must not coexist. Also live: B's accent is
signal blue `#2E5FD1` against today's navy `#1e4a7a`, and changing it touches
`themeColor`, the PWA splash and the generated icons — a brand decision, not CSS.

## 2026-07-26 — Nav group state: independent toggles, persisted, server-read
Owner's requirement: "once it's open, it stays open for him; if he closes it, it
stays so until changed — the fan out looks the same how the person set it."

**This rules out an accordion**, which was the mechanic first proposed. An
accordion closes one group when another opens, so the next click would undo the
person's setting. Each group is therefore its own toggle and the full set is
persisted. Spatial memory is the actual goal: nothing in the rail moves unless
the person moves it.

**Persist in a COOKIE, not localStorage.** The sidebar renders server-side in
`src/app/layout.tsx`; with localStorage the server cannot know which groups are
open, so every load would render all-closed and pop them open after hydration —
a layout shift on every navigation. Cookie, read in the server layout, same
pattern as `fms_auth` and the role session.

Mechanics that are easy to get wrong:
- **Absent cookie ≠ empty cookie.** No cookie = never set → code defaults (open
  the group containing the current page). Empty value = deliberately all closed.
  Collapsing the two is the obvious bug; the mock-up's logic is unit-tested
  against exactly this case, plus non-accordion toggling.
- **Durable, not session-scoped** (~1 year). "Stored in a session" was read
  together with "stays so until changed" as a lasting preference.
- **Never force a group open on navigation** — that would undo the setting. But
  always mark the group containing the current page with a dot, so closing your
  working group doesn't cost your sense of place. Breadcrumbs carry the group as
  the first crumb (*Parts › All parts*), which teaches the grouping unprompted.
- **New groups** added later aren't in an existing cookie, so they take their
  code default instead of silently arriving closed.

Per-person (rather than per-browser) is a later upgrade: mirror onto `people`
once role sessions carry a person in prod — they don't yet, no role passwords
are set. The shared-workshop-tablet worry resolves itself, because mechanics use
floor mode, whose reduced nav has no groups.

**Sequencing unchanged:** groups change URLs and muscle memory, so they are
Phase 3 (after the 31 Aug cutover), ideally agreed with Dennis rather than
decided for him. Phase 1 keeps the 14 routes and only restyles the rail.

## 2026-07-26 — Direction B palette corrected against WCAG AA (dev call)
Measured all 24 hue pairs in B's palette rather than eyeballing them, because
dropping the display face leaves colour carrying the identity alone. Four
failures, corrected in the mock-up and recorded as the token set for Phase 1:

| Pair | Was | Now |
|---|---|---|
| near-white on `--accent`, DARK | **2.59:1** | `--on-accent #161615` → 7.00:1 |
| `--money` on its wash, light | 3.76:1 | `#8E6725` → 4.59:1 |
| `--buy` on its wash, light | 4.43:1 | `#AF5029` → 4.63:1 |
| `--ink-3` hints | 3.23 / 3.82:1 | `#75746F` / `#898983` → 4.68 / 4.69:1 |

A 12px bold uppercase panel title is **not** WCAG "large text", so hue-on-wash
needs the full 4.5:1, not 3:1. That is what caught money and buy.

Two durable rules out of this:
- **Text on a filled accent needs its own token** (`--on-accent`), never a fixed
  near-white — because the accent's lightness flips between themes and the text
  colour must flip with it.
- **The shipped app already has this exact bug.** `--primary-foreground` is
  `oklch(0.985 0 0)` in both themes while `--primary` goes
  `oklch(0.36 0.105 255)` → `oklch(0.65 0.13 245)`. Measured: `#FAFAFA` on
  `#3F96D9` = **3.07:1**, below AA. So every dark-mode primary button, active nav
  item and filled badge is currently failing. Two-line fix, independent of the
  redesign — do it in Phase 1 whichever accent wins.

## 2026-07-26 — Design refresh promoted to NOW and built (owner call)
The owner moved the refresh up the plan: Dennis returns from vacation **Mon 3
Aug**, and the new look had to be live for him. Four calls locked, all as
recommended:

| Question | Decision |
|---|---|
| Scope before 3 Aug | Phase 1 + surface primitives + the screens Dennis opens daily |
| Accent | **B's signal blue `#2E5FD1`** — the palette that actually got the yes in the mock-up |
| Grouped nav | **Ship now**, not September |
| Delivery | Prod on `main` + a "What looks different" section in the August playbook |

**Why grouping moved earlier than the plan said.** The plan treated it as
post-cutover because it "changes URLs and muscle memory". It changes neither:
every child href already existed, so nothing moves and no bookmark breaks. And
right now Dennis is the only person with muscle memory, after a month away —
after 31 Aug the whole workshop has it. This is the cheapest moment the change
will ever have.

**The plan's cost model had a third category it missed.** It split the work
into "tokens propagate, structure doesn't". But 517 raw Tailwind palette
colours across 79 files inherit *nothing*, and B has no display face, so
colour IS the identity. Left alone those screens would read as broken, not
merely plainer — the fruit-salad failure the plan itself warned about for B.
So the sweep was promoted ahead of structural card-soup removal, which is now
the part that truncates if time runs short.

**Amber forced a vocabulary call.** Its 215 uses carried two meanings: the
documented money/purchasing section tint, and ~64 mid-severity cautions. B's
six hues have no warning tone, and there is no room for a seventh warm one — a
warn-amber lands at ~`#B45309`, colliding with `buy` `#AF5029`, and `money`
`#8E6725` is an adjacent ochre. So **caution reuses `money`'s ochre and
`alert` is reserved for genuine alarms.** Mapping cautions to red was tried
first and was wrong: it painted normal progress (`building`, `open`, "at
painter") red — the same error as the all-clear-in-red bug fixed the same day.
Severity is carried by treatment instead: filled wash = critical, inline text
= caution.

**Rejected:** removing the families/kits/map tiles from `/admin` as the plan
suggested. Dennis's muscle memory says Admin, a duplicate path during a
transition is useful, and the Admin clutter it addressed is a Phase-3 IA
concern, not a look-and-feel one.

**Two decorative palettes are exempt from the vocabulary** —
`bike-templates/family-colors.ts` and `kits/colors.ts`. Their hues are
identity, not meaning: a family is not "an alert". The sweep made
family-colors semantic and collapsed two families onto the same colour before
this was caught.

**Contrast: the plan's §13 work was necessary but not sufficient.** It
measured the ink ramp against `--ground` and `--surface` only. Once flat-fill
panels landed, secondary text sits on a **wash** far more often, where
`#75746F` fell to 4.06:1. Darkening `--ink-3` alone collided with `--ink-2`
(`#6B6B66` vs `#6B6A65` — the same colour), so **the whole ink ramp shifted in
both themes** to keep three distinguishable levels that clear 4.5:1 on all
eight surfaces. Every filled hue also gained an `--on-{hue}` token; the rule
generalises to "never `text-white` on a fill".

**Two corrections to the audit's own findings.** §11 bug 1 (Scan FAB over the
sidebar Collapse control) **is not real** — the FAB is `md:hidden` and the
sidebar is `hidden md:flex`, so they never coexist; measured at 1280×800 the
FAB is `display:none`. What the audit saw was the Next.js dev-tools badge,
which never ships. And bug 4's dark-mode contrast failure was **latent, not
live**: nothing in the app applies `.dark` — there is no theme provider and no
`prefers-color-scheme` wiring — so the dark theme is currently unreachable.
The tokens are kept correct and measured anyway, because the moment a toggle
lands a stale dark set would mix B's light surfaces with the old navy ones.
**No dark-mode toggle was built** — not asked for, and verifying 20 screens in
an unreachable theme is not where the pre-3-Aug budget belongs.

**`nav_open` cookie encoding differs from the plan on purpose.** The note
specified a comma-joined list of OPEN group ids, which cannot satisfy all
three of its own requirements: absent = defaults, empty = deliberately all
closed, and a group added later takes its code default. With open-ids-only a
new group is simply missing, indistinguishable from closed. Explicit
`id:1|0` pairs keep "unmentioned" free to mean "new".

**CLAUDE.md budget raised 470 → 485** for the six-hue vocabulary, which
replaced the smaller four-hue tint rule and now carries the whole visual
identity. The raise rule is now written down in the file: structural
invariants only, never to make room for narrative.

## 2026-07-27 — Phase 2, first slice: `/inbox` and `/bike-templates` onto `Panel`
The two screens STATUS flagged as "deliberately left out of the migration".
Both were 100 % hand-rolled `rounded-md border` boxes, so they were the
cheapest place to settle the conventions the first pass had left open.

**A table inside a panel gets no wrapper box.** The already-migrated detail
screens (bikes, parts, invoices) kept a `rounded-md border` around tables
*inside* a `Panel` — a box inside a box, which is the pattern the panel was
built to delete. `Table` already renders its own `overflow-x-auto` container
and its own row rules, so the wrapper adds nothing but a hairline. Settled as
a convention in CLAUDE.md rather than left to taste; the older screens still
carry the old shape and can follow when they are next touched.

**Family colour moves from a tinted header band to the title dot.** The
templates list used `familyTint().header` as a wash behind each family's
header row. On a `Panel` that wash would have to meet the six-hue contrast
matrix — but family colours are *decorative identity*, explicitly exempt from
the vocabulary, so measuring them into it would either constrain the palette
or quietly break the guarantee. The dot carries the same identity (it is what
the detail chip already uses) at no contrast cost.

**Suspected spam is `money`, not `alert`.** The triage banner filled with
`bg-money-wash` but titled in `text-alert` — a caution wearing an alarm's ink.
Now a `hue="money"` panel throughout, per the vocabulary's amber-as-caution
rule. Red stays scarce.

**Rejected: keeping the two ingress forms tinted.** `/inbox` had a brand-wash
uploader next to a good-wash command box, two hues that carried no domain
meaning between them. Both are plain surface panels now — `/inbox` is a
single-purpose queue, and the tinting rule reserves washes for pages that
stack genuinely different kinds of section.

**`Panel` gained `id` and took `ReactNode` titles/descriptions.** Anchors
(`#family-<id>`) had nowhere to land, and two callers need a mark inside the
eyebrow (the family dot, a status glyph) or inline figures in the description
(the recipe's cost/retail/margin summary). Widening beats a second primitive.

## 2026-07-27 (later) — the older panels were swept, not left to attrition
Supersedes the closing line of the entry above ("the older screens still carry
the old shape and can follow when they are next touched"). They were done the
same day instead: **zero boxed tables remain inside a `Panel`** anywhere in
`src`. Leaving them would have meant the app teaching two shapes at once, and
the change turned out to be a wrapper `<div>` deletion per table — no layout
reasoning, since `Table` already brings its own overflow container and row
rules. On a *hued* panel the container stays (CLAUDE.md: inner tables sit on
`bg-surface`) and only the hairline goes.

## 2026-07-27 (later) — long forms fold; the default is per record, not per user
Plan §9's last open item: organisation (21 fields), part (15) and supplier
(14) all presented every field at once. Required fields now stay visible and
the rest sit behind folded sections — `FormSection` in
`src/components/form-section.tsx`, one shared component replacing the
identical local helper that four forms had each copy-pasted.

**A section's default state is computed from the record, not remembered from
last time.** `CollapsibleSection` (the part-detail fold) persists the user's
choice in localStorage, and copying that here looked obvious — but a form's
right answer changes per record. A remembered "Address closed" would hide the
address of the *next* customer you opened. Instead each section opens on
arrival if that record already holds something in it, so an edit form shows
what is filled and a create form shows only what is required. Fields with
defaults (currency DKK, terms 30, unit `pcs`) don't count as content, or
Billing and Specs would be open on every new record.

**Folded sections unmount their children.** Safe because all three forms build
their FormData from React state, never from the DOM — nothing is lost, and a
mounted-but-hidden `required` input would make submit fail silently on a
control the browser cannot focus. The consequence is that a validation error
inside a folded section would be invisible, so `forceOpen` unfolds the
section owning the failed field (organisation: email, payment terms; part:
the five spec fields). It is derived, not an effect that pushes state, so the
section snaps back to the user's own choice as soon as the error clears.

**Supplier's flat form gained the two sections it never had** — *Supplier*
(name, currency, terms, primary email, duty-prepaid, active) and a folded
*More details*. Four new message keys, en + da.

`CollapsibleSection` moved onto `Panel` in the same pass so the app has one
fold, not two that look different.

## 2026-07-27 (later still) — the inbound provider blocks are rows, not cards
Plan §9's remaining piece. The three capability blocks (transcription,
extraction, telephony) were bordered cards holding 13 inputs between them,
inside the settings panel the sub-rail had already narrowed to one section.

**They are now summary rows that expand on demand** — *Transcription · Gladia
(EU) · ✓ Ready* — so the arrival state of the Phone & inbox section is two
controls (shadow mode, Save) instead of thirteen. Rows separated by hairlines
rather than a third generation of nested boxes; the expanded body sits on
`bg-surface`, which is what the tinting rule asks for inside a hued panel.

**A row with a missing secret starts open.** Same record-driven default as the
form folds: the one state an admin opens this page to fix should not also need
a click to find. Everything healthy stays shut.

**Also fixed here, pre-existing:** `Label` is `flex items-center gap-2`, so the
seven `<span className="block text-xs">` hints inside labels on this form were
rendering as flex ITEMS beside the label — squeezing "Production number" onto
two lines and giving the hint half the row. They stack now. The pattern existed
only in this file.

## 2026-07-27 (evening) — the real-data verification pass, and what it found
Phase 2 shipped to prod before any data-driven page had been rendered against
real data (the container had no `.env.local`). This pass closed that gap: eight
checks against the production DB, in a browser, highest-risk first. Five passed
untouched — the supplier form round-tripped all 16 fields, `/admin/settings?
section=phone` arrived exactly as designed (three closed rows, three "Ready",
two controls, save a no-op), hued panels kept their `bg-surface` table
containers, the seven converted empty states render as `bg-ground` fills, and
390 px showed no page-level horizontal scroll anywhere. `forceOpen` works: an
invalid payment term with Billing collapsed unfolded the section and wrote
nothing. **No revert was needed.** Four findings, all fixed forward.

Two gaps the data cannot close: **no bike template has paintwork rows** and
**every bike (25) was soft-deleted 2026-07-01**, so bike-detail empty states
and the template paint box have never been seen with real data. The spam banner
has no data either — its `hue="money"` was confirmed by reading the code.

## 2026-07-27 (evening) — a form's defaults belong to the form, not the page
**The bug.** `EMPTY_*` shells were exported from `"use client"` form modules and
spread in server pages. A client module's exports are *client references* on the
server: `Object.keys(EMPTY_ORGANIZATION_SHELL)` returns `[]`, so
`{...EMPTY_ORGANIZATION_SHELL, …}` evaluated to `{}` and every default was
dropped. Live consequences, all pre-existing and all invisible to the gates:
one-off MO arrived with a **blank required Target quantity**, ticket Source and
Priority blank, work-order Language blank, template Currency blank, and every
customer default (country, lifecycle, language, currency, terms) blank.

**Fix (all 20 sites, owner's call over the 8 broken ones).** The shell is now a
module-local `const` — a page *cannot* import it, which is the enforcement, not
a convention — `initial` is a `Partial<…>` of overrides, and the component
merges `{ ...EMPTY_X, ...initial }` into `seed`. Fold defaults read `seed`, so
they see merged values rather than raw overrides. Rejected: extracting 20 plain
`*-form-values.ts` modules (fixes the import but leaves the footgun exported)
and re-exporting the type from the client module (same trap, one indirection
away). Sentinels a page used to pass (`ONE_OFF_VALUE`) became props (`oneOff`).

**Why it is worth a CLAUDE.md invariant:** this is the third instance of one
shape — `fa1dbed` (server component *calling* a client function), and now
spreading and property-reading a client export. `tsc`, `lint` and `next build`
are all green every time.

## 2026-07-27 (evening) — customer payment terms are net 14, in one place
The fold rule asked "has the user moved off the default?" against the literal
`"30"`, while the schema default (migration 01) is **14**, invoicing already
had `DEFAULT_PAYMENT_TERMS_DAYS = 14`, and 531 of 535 customers hold 14 (3 hold
NULL, 1 holds 8). Every customer in prod therefore opened Billing. The form now
reads that constant for its shell value, and the fold compares against the
shell rather than a literal, so the two cannot drift again. Placeholder and the
"default to net 30" copy (en + da) corrected to 14.

Deliberate: this changes what a *new* customer is pre-filled with, from 30 to
14. That aligns the create form with the schema, with invoicing, and with every
existing customer — the 30 was the outlier, and nothing in prod was written
with it (the shell bug above meant the field posted empty and the DB default
applied). Flagged to the owner rather than treated as invisible.

## 2026-07-27 (evening) — folding a section removes native validation
`<Input type="email">` and `type="url"` only validate while mounted, and a
folded `FormSection` unmounts its children — so from the moment the long forms
started folding, an invalid address inside a collapsed section reached the DB
unchallenged. Neither the customer nor the supplier action validated either
field. Both do now, via shape-only `looksLikeEmail` / `looksLikeUrl` in
`src/lib/forms.ts` (loose on purpose: `sales@büchel.de` and intranet hosts must
pass), and the customer action returns `field` so Contact unfolds with the
error inline. The supplier form has no per-field error channel, so its banner
names the offending value instead — worth a row, not a refactor.

Numbers were already safe: every numeric field in these forms is parsed and
rejected server-side with a `field`, which is why `min="0"` being bypassed
showed up as a clean inline error rather than a bad row.

## 2026-07-27 (evening) — Tier 1 CI pulled forward from September
BACKLOG had it parked for September. Shipped now as `.github/workflows/ci.yml`
(~20 lines, `npm ci` → `tsc --noEmit` → `npm run lint`, no secrets, Node 22
LTS): Next 16 does **not** run ESLint during `next build`, confirmed again in
this session — the repo has 14 lint warnings that `npm run lint` prints and the
build never mentions. So Vercel deploys lint errors, and that is exactly the
class that reached `main` on 2026-07-26.

**The honest argument is narrower than "it protects Dennis while you are
away".** Nobody pushes while the dev is unreachable, so CI buys Dennis little
directly; what it protects is `main` from the sessions that *do* push — and
today's commits would have skipped the local build gate entirely, since a dev
server held :3000 the whole time. Tier 2 (runtime + Vitest, needs secrets)
stays in BACKLOG for auth/M1.

## 2026-07-27 (late) — the list-page slice, and the two calls inside it
**All eleven, not the three the plan named.** Sales orders, MOs and
`admin/kits` were on the list; POs, paint orders, service agreements, bikes,
customers, tickets, work orders and the parts table turned out to be the
identical `overflow-x-auto rounded-md border` wrapper around a `Table`. Owner
took all eleven: same one-line change, and stopping at three would leave the
app reading half-migrated. The wrapper was redundant twice — shadcn's `Table`
brings its own `overflow-x-auto` container — which is why removing it costs
nothing at 390 px.

**The batch-build grid keeps its raw `<table>`.** Its rows carry inputs and the
scan handlers; swapping in the `Table` primitive is behaviour risk on a
workshop-critical screen for no visual gain. The consequence is that the
scroller has to live on the panel body (`contentClassName="overflow-x-auto"`)
where the primitive would have supplied its own — worth a comment in the file,
since it looks like an oversight otherwise.

**Scope crept by exactly one file, deliberately.** The PO **lines section**
was not on the list, but it sits directly above the receive form that was, and
leaving it boxed would have split that screen down the middle. Finishing a page
I had already changed is inside the approved scope; the ~20 remaining
form/detail shells are not, and stayed untouched.

**`bg-ground` is an in-panel fill, not a page-level one.** Converting the
bulk-build "nothing left to build" notice from a dashed box to a `bg-ground`
fill made it invisible: the page background already IS `--ground`. Page-level
notices get their own `Panel`. Recorded because `tsc`, `lint` and `next build`
were all green while the screen looked broken — the same class of miss as the
morning's client-reference bug, caught the same way (in a browser).

## 2026-07-28 — The CLAUDE.md size gate is deleted, not relocated
Ported from Munin, which proposed it after running the same experiment. The
argument was adopted; its supporting numbers were replaced with this repo's,
which are checkable here.

**It never denied anything.** `claude-md-budget.sh` landed 2026-07-25 at 470
lines (commit 5a5f235) and was raised to 485, 490 and 495 by 2026-07-27
(ed81643, 68afe88, 4149809) — four raises in three days, zero refused
additions. That is structural, not laziness: the rule was "raise it when the
addition is an invariant", so the gate could only ever ratchet. A notification
that cannot deny is not a control.

**It had come apart from its own config.** At deletion the prose said `~530`,
`settings.json` passed `495`, and the file stood at 528 — so the hook fired on
every single edit while the rule it enforced said the file was fine. Worse, the
prose recorded two raises (520, 530) that were **never applied to the hook at
all**: doctrine was being maintained in a place that drove nothing. That is the
predictable result of writing one number in two places.

**Size was the wrong variable.** The harm is self-contradiction, which no line
count detects — the 495-vs-530 split, and a stale `~200` worklog-character cap
in `CLAUDE.md` against the `300` the hook and skill both used, were both found
by reading, not by any counter. Both are fixed in this commit.

**What the gate did earn:** the file was 812 lines before the target existed
and 528 after, so it worked once, as a one-time forcing function. It is being
removed because that job is done and the instrument degraded into an alarm —
not on a claim that it never helped.

**Replaced by:** a monthly consolidation pass in the `session-start` skill — a
calendar, not a threshold, so it cannot be satisfied by deleting doctrine. Plus
a standing rule against counts in durable docs.

**Kept:** `worklog-row-budget.sh 300`. It enforces a row *format*, not
adherence to an always-loaded file, and it is the one counter here with a
demonstrated record (July rows hit 4–6k characters against May/June's 250–400,
under an earlier "one line per row" rule that measured the wrong thing).

**Rejected:** moving the size check to session start (a better-timed useless
alarm); measuring relative growth instead (growth is expected in an active
repo); and Munin's proposed `~200`-line aim — an unsourced count inside the
rule that bans counts, which this file is 2.6× over, i.e. a standing debt a
future session would pay down by deleting doctrine. Length stays a direction
with no number attached.

**Not done here, deliberately:** the 528 lines are untouched. Shrinking the
file in the same breath as removing its size gate is how a session ends up
shaving earned doctrine to hit a number. The first monthly pass owns it, and
the honest fix is extracting narrative to `docs/archive/HISTORY.md`.

## 2026-07-28 (later) — /work's accent bars map onto the six hues
The four colour-coded left bars on the work-order workspace were the last raw
Tailwind palette colours in the app, and they turned out **not** to be
deliberate exceptions: the 517-colour sweep's pattern simply never matched
`border-l-*`, `from-*` or `fill-*`. The intended mapping was already sitting in
the code beside them — the Diagnosis icon was already `text-money`, Work
performed already `text-good`, the queue card's stripe already `bg-brand`.

`amber-500 → money` (diagnosis is caution, and caution is money's ochre — a
bike needing diagnosis is normal work, not an alarm) · `emerald-600 → good`
(done) · `indigo-600 → buy` (parts consumption is the cost side of a job:
those lines carry money and draw down stock) · `slate-600 → rule-strong`
(photos are evidence, not a domain — a neutral rule identifies the section
without spending a seventh meaning) · `blue-600 → brand` (queue gradient) ·
`amber-400 → buy` (the preferred-supplier star's fill; its stroke was already
`text-buy`).

**Rejected:** full hue *washes* on all four sections — four washed panels in a
column means none of them reads as emphasised, and the doctrine is that colour
is meaningful only while scarce. The bar is the right carrier. Also rejected:
inventing a seventh meaning for photos.

No hue value changed, so the contrast matrix needed no re-measurement, and the
bars are never the only carrier (every section has a text title and an icon).

## 2026-07-28 (later) — the archive footer ships untinted: caution + destructive fails AA
`ArchivePanel` (extracted from seven copies) first used `hue="money"`, which is
correct on its own terms — archiving is reversible, so it is a caution, and
caution is money's ochre rather than alert's red.

**Measured, it fails.** The destructive button's own `alert/10` pill composited
over the money wash gives **4.25:1**; on plain `bg-surface` the same button
gives **4.69:1**. The gate is 4.5:1 and the button's label (12.8px, weight 500)
is not WCAG large text. So the panel ships with no hue, and the reason lives in
its doc comment so the next person doesn't re-derive the tint.

This is the cross-hue trap `CLAUDE.md` already names — "a `hue` panel lets any
two meet" — with a specific lesson worth keeping: **the caution-hue mapping is
not free next to a destructive control.** The destructive button already
carries the weight of the act; the surface does not need to shout.

**Measurement gotcha:** two earlier attempts produced garbage (3.86, then
3.91) because the button's background is an `oklab()` with alpha that neither
`getComputedStyle` nor `canvas.fillStyle` normalises to sRGB. The trustworthy
method is to paint the wash on a 1×1 canvas, composite the pill over it, and
read the pixel back.

## 2026-07-28 (later) — shared surfaces beat per-entity copies; a control border is not card soup
Phase 2's remaining sweep found three duplication clusters, each identical down
to the class list, and each now one component:

- **six** local `FormSection` helpers in the MO / PO / paint-order / ticket /
  WO / bike forms → the shared `src/components/form-section.tsx` that slice 3
  had already extracted for the other four forms
- **seven** archive/restore footers → `src/components/archive-panel.tsx`
- **eight** form save bars → `src/components/form-save-bar.tsx`

`ArchivePanel` takes a message **namespace**, because all seven callers'
namespaces provably hold the same six keys. `FormSaveBar` takes rendered
**strings** instead, because those namespaces have drifted: six say `savedAt` /
`saveChanges` while `adminColors` and `adminHsCodes` say `savedStatus` /
`submitEdit` for the same two things. Passing strings avoided an i18n rename
across three locale files for a layout change. **The drift is real and should be
normalised the next time those messages are touched.**

`EmptyState` gained an `inPanel` flag rather than a per-call-site override,
because three sections render it *inside* a panel where its dashed box is the
boxed-thing-in-a-box the panel replaced.

**And the counter-rule, which cost real time to establish:** a `rounded-md
border` is **not** automatically card soup. Nine of slice D's 31 hits are
native `<select>` / `<input>` elements styled to match shadcn's `Input`
(`border-input bg-background h-9 rounded-md border`), plus `category-drawer`'s
input-shaped filter chips and the recipe quantity stepper (a button group,
which the conventions already exempt). Those borders belong to the control and
must stay. Sweeping by pattern alone would have broken how the forms read.

## 2026-07-28 (later) — /admin/lists approved; floor/office approved but scheduled after cutover
Both gates on the design-refresh queue are cleared by the owner.

**`/admin/lists`** (plan §8, 18 routes → 1) is approved to build. It is
admin-only, so Dennis's exposure is limited to a surface he visits to configure
vocabularies, not one he works in daily.

**Floor/office mode** (plan §6) is approved *in principle* and deliberately
**not scheduled before the 31 Aug cutover.** It is the largest item in the plan
and it reshapes the screen mechanics use every day; shipping it into Dennis's
solo stretch (from 3 Aug) means he absorbs a changed floor UI with no developer
on hand. The concern was raised, the approval stood, and the timing is the
compromise: build it after the cutover, when there is someone to watch it land.

**Superseded:** `docs/STATUS.md`'s Phase 2 queue items 3 and 4, which both read
"ask first". They no longer need asking; item 4 needs scheduling.

## 2026-07-28 (evening) — floating surfaces get elevation; the edge is not chased to 3:1
Phase 2 put nearly every form section on a white `Panel`, and `--popover` IS
`--surface`, so a dropdown opening over one had **zero** fill separation —
measured 1.000:1, with shadcn's `ring-1 ring-foreground/10` (ink at 10% →
rgb(232,232,232)) giving a **1.225:1** hairline as its entire edge. Reported by
the owner as a white smudge.

Partly self-inflicted and worth stating precisely: the old per-form
`FormSection` had no background, so its body showed page ground `#fbfbf9` and
the dropdown already sat at **1.036:1** — invisible in practice. Moving to
`Panel` removed the last 3.6%, and converting six more forms made it visible
everywhere. The defect predates the change; the change exposed it.

**Decision: fix it as elevation.** New `--elevation-popover` (three shadow stops
+ a 14% hairline) → the `shadow-popover` utility, on all five overlay
primitives: select, dialog, dropdown-menu, popover, tooltip. They shared the
weak ring and all now open over white panels — Select alone in 38 files.

**Rejected: chasing WCAG 1.4.11's 3:1 on the container edge.** `--rule-strong`
as the ring measures only **1.378:1**; reaching 3:1 against white needs roughly
`#949494`, a mid-grey outline around every dropdown in the app. It fights
direction B and buys little, because list items are identified by their own text
and hover states — the container edge is reinforcement, not the carrier. Owner
agreed explicitly.

**Also rejected:** tinting popovers `bg-ground` (fixes them over panels, breaks
them over the page). `sheet.tsx` left alone — per-side borders already define it.

Dark mode gets its own recipe, not the light one scaled: `--ink` is near-WHITE
there, so an ink shadow would glow. Black shadows, deeper, hairline flipped to a
light rim — a raised surface on a dark ground reads by its lit edge.

## 2026-07-28 (evening) — bike creation: MOs own building, /bikes/new records the rest
Prompted by a real stranded bike. `/bikes/new` hardcoded `status: "planning"`;
`planning → building` was an allowed move; and a `building` bike with no MO has
no exit, because `finishBikeBuild` is the only path to `in_stock`, it lives
under `/manufacturing-orders/<mo>/…`, and `/work`'s queue filters to bikes on an
open MO. Two reasonable clicks produced a dead end.

**The scenarios, enumerated with the owner** — four, not three, because
build-to-stock is distinct from build-to-order (no customer at all), and
"a bike needs fixing" is NOT a creation scenario at all: it presupposes the bike
exists, so it is *record* + work.

| Scenario | Route |
|---|---|
| Customer orders bikes | SO → MO → Add bike |
| Build to stock (no customer) | MO with no SO → Add bike |
| Record a bike that already exists | `/bikes/new` |
| Fix a bike | bike must exist; then ticket → Start work order, or `?bike=` deep link |

**Decision:** each route gets one meaning. `/bikes/new` may produce only
`RECORDABLE_STATUSES` — `in_service` (owner required; a bike with no owner is a
row nobody can be billed or contacted for) or `in_stock`. It may not produce
`planning`, enforced as a whitelist rather than a cast. Building belongs to MOs,
full stop. This closes the trap by construction; the transition guard shipped
earlier the same day becomes belt-and-braces.

**`in_stock` from this form was kept at the owner's request, against my
recommendation** to leave those few to the cutover import. It mints a bike with
no `build_cost_dkk` — exactly what `finishBikeBuild` prevents for bikes we DO
build. Accepted because for a bike we did not build there is no build cost, null
is the honest value, and every reader of that column null-guards (verified). The
reasoning lives in the `RECORDABLE_STATUSES` docstring so it is not later
"fixed" as an oversight.

**Rejected:** promoting the new bike actions to their own buttons — the owner
wants the existing "…" dropdown preserved.

## 2026-07-28 (evening) — adopting an existing bike into an MO: UNDECIDED
Recorded so a later session neither assumes it is approved nor re-argues it from
scratch. It is **not** rejected — the owner is undecided.

It is the missing capability behind two separate asks: the owner's
"Create manufacturing order" button on a bike detail page (which would need to
*pre-select* that bike, and MO creation has no bike field — bikes are added
afterwards, and `addBikeToMO` CREATES rather than attaches), and the only route
that could rescue prod's one stranded bike, `JP-3333-12`.

If it is ever built, do NOT reuse `addBikeToMO`: it inserts a bike (adoption
needs an update), it registers a frame-number identifier (an existing bike
already has one, and that column is globally UNIQUE, so it would fail), and it
applies the SO slate (overwriting an owner the bike may already have). Also
settled while investigating: no backwards status transition is needed —
`finishBikeBuild` accepts `planning` OR `building` and only checks MO
membership.

Until then, the recovery for a stranded bike is manual: new MO → Add bike →
build that one → retire the stranded one.

## 2026-07-29 — /admin/lists ships: 18 routes to 1, and two capabilities ported rather than deleted
Implements the 2026-07-28 approval. Built in two commits: the page additively
first (13c620e), then the retirement of the old routes.

**The plan's shared-field premise was wrong.** Plan §15 assumed the
vocabularies shared `{name_en, name_da, is_active, sort_order}`. Checked
against the live schema, the only column all seven have is `is_active`; the
name alone comes in four shapes (`name_en`/`name_da`, a bare `name` on
families, `label_en`/`label_da` on coatings, `code` + `description` on HS
codes) and two tables have no `sort_order`. So there is no one form to render
seven times — hence a descriptor layer (`src/lib/admin/vocabularies.ts`) read
by one renderer. Do not try to unify the fields later; that is the thing that
does not hold.

**Coatings is the seventh vocabulary**, not a second section of
`/admin/colors`, and `/admin/kits` is deliberately NOT one of them (floor
picking aid, per CLAUDE.md).

**Redirect, not delete, for the 18 routes** — they may be bookmarked, and a
404 on a route that worked yesterday reads as the app being broken.

**Two capabilities had to be PORTED, and finding that changed the commit.**
`/admin/locations` was the only home for the hide/reveal of
`hide_location_info` and the per-row "Make primary". Neither exists on
`/admin/settings` — the visibility toggle's own docstring claimed it mirrored
one there, which was false. Redirecting on the letter of "retire all 18" would
have made two settings unreachable from the UI. Both now live above and inside
the locations tab, and CLAUDE.md's location-config rule is edited in this same
commit.

**Usage counts were restored after being dropped.** The retired colours and
segments pages showed an "in use" tally so the archive warning could be
concrete. The first generic version omitted it, and the second omitted the
retired pages' `deleted_at` filter on referencing rows — reporting 13 uses of
White where 5 bikes are live and 5 were soft-deleted the day before. An
archive warning that overstates usage is worse than none, so `usage` carries a
REQUIRED `excludeDeleted` per source table (`manufacturing_orders` has no
`deleted_at`; setting it there would silently return zero rows).

**Rejected: making the row editor own the entity rules.** The parent-cycle
check, the primary-location archive block, the duplicate-code and unique-slug
messages all stay in the seven existing actions, which are reused unchanged;
`_actions/dispatch.ts` only routes and revalidates. Reimplementing them in a
generic editor would have forked proven validation.

**Known cost, accepted:** the *Bikes → Families* nav item now points at
`/admin/lists?vocab=families`, and `pathMatches` compares pathname only, so
`/admin/lists` lights up ADMIN rather than that item. It always pointed into
`/admin/*`, so its group was already a label rather than a path. Teaching the
nav to match search params was rejected as too much shared-internals change
for one item's highlight — revisit if a second query-string nav item appears.

## 2026-07-29 (later) — the paint estimate refuses to substitute; the default supplier is set from a price list
Owner-reported, found by simply trying the "Default suppliers" dropdown on
`/admin/services` and watching nothing change.

**What was wrong.** That panel was a free select over every active supplier, and
picking one with no price list produced a state nothing surfaced: the screen
showed the chosen name with a green "Saved", `loadDefaultPaintList` silently fell
back to `lists[0]` so every template kept showing a cost-to-paint priced off a
DIFFERENT painter (feeding cost-to-produce and margin), and `/paint-orders/new`
pre-selected a supplier whose lines could never be priced, so those orders could
never be sent. Three consequences, none visible.

**Decided — the estimate refuses.** No default, or a default with no current
list ⇒ no estimate, plus a message naming which case and which supplier. Chosen
over the two alternatives the owner was offered: showing the number loudly
attributed to the substitute supplier, and showing it while nulling `totalDkk`.
Reason for the strict choice: this total flows into margin, and a margin computed
from a painter nobody selected is a wrong number wearing a right number's
clothes. `PaintListUnavailable` carries the reason so each case gets its own
sentence and its own fix.

**Decided — "Make default" replaces the dropdown, and the dropdown is deleted.**
The control now lives on each price-list panel; the current default shows a badge
instead. Choosing a supplier with no prices stops being possible rather than
being validated against — the button only exists where a current price list
exists. `/admin/services` also grew a `money` panel naming any service type whose
default cannot price, because the broken state predates the fix and would
otherwise stay invisible on the page that caused it.
Rejected: keeping the select with invalid options disabled — two write paths for
one setting, and the disabled-option affordance still invites the question.

**Not built, deliberately: a "New service type" button.** Nav and routes are per
service type permanently, so a created type would have no nav entry and no order
pages — a row you can make but not use. Same shape as the provider-registry rule.
`service_part_types` is the opposite case (pure vocabulary, no routes) and belongs
on `/admin/lists`; parked in BACKLOG.md rather than bundled here.

**Prod config changed during verification:** painting's default was
`Test Nazar Supplier` (no price list, set while testing the old dropdown) and is
now `Metacoat A/S`, the only painter with a current list — the working value.

## 2026-07-29 (evening) — Slice F built now, not after the solo stretch; service part types get a tab
Two owner calls, both overriding standing recommendations here.

**Slice F: build it now.** STATUS had it queued *after* Dennis's solo stretch on
the grounds that these are the screens his mechanics use daily and the upside is
cosmetic. The owner's call: it is cosmetic, so do it — the structural item
(floor/office) is the one that waits for a conversation with Dennis. Shipped as
seven commits, one file each, every one browser-verified against real data before
the commit, per the plan's own rule.

**The verification found two real bugs, both in `scanner`, neither cosmetic** —
and this is the argument for the one-file-at-a-time rule rather than a batch:
manual entry never worked for a frame number, and leaving `/scan` after declining
the camera threw a runtime error. Details in the plan's §14 list and commit
`1f34f9a`. Both were pre-existing and invisible to tsc, lint and `next build`.

**Service part types become the 8th `/admin/lists` tab** (`ad1c559`), which was
the first extension of the descriptor layer and cost exactly what the design
promised: one descriptor entry plus a three-function action file, no route and no
components. Its `usage` tally deliberately counts live paint-order lines and
template paintwork — what WE send — and NOT `service_price_items`, since a
supplier pricing a part type is their catalogue rather than our usage.

**Still refused, and this is the durable half:** a "New service type" button. Nav
and routes are per service type permanently, so a created type would have no nav
entry and no order pages. Recorded in CLAUDE.md so it is not revisited as an
oversight.

**`slugify` was lifted to `src/lib/forms.ts`** from four byte-identical copies
(colours, coatings, segments, categories) when a fifth was about to be written.
