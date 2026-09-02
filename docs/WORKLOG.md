# Worklog

Nazar's personal hours-and-work log for the Jensen FMS engagement. One
row per working day, updated **each morning at session start** (the
assistant appends today's row and reconciles the previous one). Hours
marked `~` are estimated from commit timestamps — correct them anytime
by saying e.g. "log: Jul 9 was 7h".

Days with no row = didn't work that day. That's fine.

**Backfill note (2026-07-10):** rows before July 10 are reconstructed
from git history (commit blocks + lead-in). Planning sessions on
claude.ai, data entry, and calls outside commit blocks aren't captured —
treat the early totals as floors, not truth.

## May 2026

| Date | Hours | Work |
|---|---|---|
| Thu 2026-05-07 | ~1 | Project born — Next.js scaffold |
| Fri 2026-05-08 | ~5 | Parts module end-to-end (list, detail, photos, offerings, POs, categories); phases 2A–2D in one evening: templates + recipe builder, bikes + lifecycle, MOs + build workbench |
| Sat 2026-05-09 | ~1 | L2 walkthrough fixes (photo orphan, MO auto-advance) |
| Wed 2026-05-20 | ~6.5 | Model/variant collapsed into templates; paint orders; nav + branding (Deep Nordic blue, logo); dashboard v1; responsive sweep; organizations + assign-to-customer + contacts/units |
| Thu 2026-05-21 | ~8 | PO entry flow; maintenance tickets (M3a) + work orders (M3b); PWA push: manifest, QR stickers + batch print, staff scan flow, customer report page, service worker; mobile sweeps |
| Fri 2026-05-22 | ~5 | HS/TARIC codes + landed-cost refactor; FX rates (fetch/admin/cron); per-bike build workbench (bike_parts source of truth); sales orders (3C); admin colours + segments |
| Sat 2026-05-23 | ~8 | Public /report flow (scan-first, rate-limited); workshop floor M3d + voice notes; admin list harmonization; customer map + design bundle; type/money polish; v0.9.0 |

**May total: ~34.5 h** (7 working days)

## June 2026

| Date | Hours | Work |
|---|---|---|
| Sat 2026-06-06 | ~1.5 | TARIC import + per-part tariff override; anti-dumping duty in landed cost |
| Sun 2026-06-07 | ~4.5 | Historical landed-cost backfill; supplier CRUD; v0.10.0 + cross-thread handoff; customer-import schema |
| Mon 2026-06-08 | ~5 | 659 e-conomic customers imported + DAWA geocoding; customer map layers (bikes, prospects); service agreements CRUD (M3c); shared detail-page primitives |
| Thu 2026-06-11 | ~8.5 | Kits (sticker labels) end-to-end; retail prices on parts; category-driven recipe editor; collapsible sidebar; searchable customer picker; category browser slide-over; tech add-parts page |
| Fri 2026-06-12 | ~7 | Bulk-first MO creation + stock coverage + draft-PO from shortfall; **invoicing 3D complete in one day** (uninvoiced list, invoice from WO + SO, bilingual print, agreement fees + credit notes) |
| Fri 2026-06-19 | ~4 | **Dennis app-review call (84 min)** + all 11 core-flow backlog items shipped same evening (blank PO price, template margin, ISO-week delivery, RAL+coating, category admin…) |
| Sat 2026-06-20 | ~12 | Tier 2 complete (deliberate build, unified workshop floor, paint gates build, SO↔paint, labeling note); locations simplification; nav/IA reorg with owner; Tier 4 deposits started (VAT model locked + kinds A/B) |
| Sun 2026-06-21 | ~5.5 | Tier 4 shipped (part-based deposits + stock valuation); bulk build grid + printable pick sheet; working-language settings; i18n parked |
| Wed 2026-06-24 | ~1 | RLS enabled on all 55 tables (migration 50) |

**June total: ~49 h** (9 working days)

## July 2026

| Date | Hours | Work |
|---|---|---|
| Thu 2026-07-02 | ~3 | **Dennis call #2**; AI part-image fetch batches (65 images); category sort + vertical picker; paint per-line colour+scope (migration 51) |
| Fri 2026-07-03 | ~1 | Paint per-line pricing + additive JP-lak auto-cost (early-morning block) |
| Mon 2026-07-07 | ~2.5 | Additive svaj pricing follow-ups; last part images (74/176); July-2 backlog: back-dated stock adjust, qty-at-pick, template duplicate, supplier-at-create |
| Tue 2026-07-08 | ~7 | Bike families vocab (mig 52+53); import-tax origin model (mig 54); FX stock adjust; communication settings + DNS card (mig 55+56); printable PO + email-to-supplier (mig 57); dashboard money band + trends (mig 58) |
| Wed 2026-07-09 | ~6 | Dashboard drill-down + Excel backfill (mig 59); 3E e-conomic push live-tested (mig 60); section tints app-wide; part/SO domain bands; template hard delete; locations move; **owner call** (~40 min); July plan doc |
| Thu 2026-07-10 | ~8 | Painter price list analyzed; service model designed + SHIPPED (migs 61–63: service_orders promotion, tiered price lists, snapshot-at-send, JP-lak retired, template cost-to-paint); housekeeping drill-down + mobile photo iOS fixes; worklog set up |
| Fri 2026-07-11 | ~8 | /admin/services price-list revision grid (mig 64: atomic publish RPC + tier-overlap EXCLUDE constraint); **i18n sweep launched** — next-intl foundation + per-surface locale, then Danish for the worker surfaces, app chrome, dashboard, bikes, templates |
| Sun 2026-07-12 | ~15.5 | i18n Danish sweep — nine modules in one long day: parts, maintenance, MOs, POs, SOs, paint orders, invoices, service agreements, customers/orgs (incl. the Leaflet map); shared DeliveryWeekDateField + lang namespace |
| Mon 2026-07-13 | ~4 | i18n Danish sweep — admin cluster (9 sub-modules, 490 keys) + QR pages, then the full server-action error-string mop-up (~560 keys, shared `errors` namespace). UI i18n sweep closed |
| Mon 2026-07-14 | ~3 | Controlled-vocab `localizedName` sweep closed (~90 files); generic inbound trunk designed + slices A/D/E shipped (migs 65–67); config-vs-secrets doctrine + provider-registry seam |
| Tue 2026-07-15 | ~2 | Inbound slices B, C, F shipped (mig 68) — Gladia/Azure transcription, Claude extraction, Twilio webhook + retention cron; live-call verified over a tunnel; `/admin/inbound` → `/inbox` |
| Wed 2026-07-16 | ~2 | **Inbound pipeline LIVE IN PRODUCTION** on the DK number; triage layers 1–5 shipped (migs 69–72: call events, split confidence, spam, intent routing) + the save-caller learning loop |
| Thu 2026-07-17 | ~2 | Design day: people & roles (`plan-people-roles.md`) + voice commands (`plan-voice-commands.md`); Munin spun out to its own repo; July plan re-sequenced Jul 17 → Aug 3 |
| Fri 2026-07-18 | ~3 | **backup-kit shipped** (own repo): `backup-all` one-command drive backup (git bundles + mirrors + DB dumps into an AES-256 sparsebundle) + nightly launchd `pg_dump` ×3 w/ storage sync + retention; RESTORE.md; Supabase upgraded to Pro |
| Thu 2026-07-23 | ~18 | **People & roles P1–P4 all shipped** (migs 73–74) — interim auth complete; docs restructure for handover (CLAUDE.md 1457 → 450 lines + the docs/ scheme); global identifier search; perimeter audit; voice commands VC-1 (migs 75–76). July queue 1–5 done |
| Sat 2026-07-25 | ~7 | **Live-call recording V1 shipped + live-verified on a real bridged call** (migs 77–78); speaker attribution fixed to Gladia's `channel` tag; provider evaluation closed (keep Twilio + Gladia + Claude); AI-receptionist tier decided, not queued |
| Sun 2026-07-26 | ~10 | **Design refresh built and shipped** — B tokens in signal blue, Panel/Metric primitives, 517-colour sweep onto six hues, 7-group nav w/ cookie state, settings sub-rail; 21 commits, 10:16–20:39 |
| Mon 2026-07-27 | ~8 | **Phase 2 (5 slices) + its real-data verification pass** — 4 fixes incl. the client-reference bug that blanked create-form defaults app-wide, plus Tier 1 CI and every list page onto Panel |
| Tue 2026-07-28 | ~11 | **Design-refresh Phase 2 slices A–E** (three duplicated component clusters collapsed, 25 sections/dialogs//work onto Panel, last raw palette colours onto hues) + CLAUDE.md doctrine. Two owner-found defects: popover elevation, bike creation settled. Then `/admin/lists` commit 1 |
| Wed 2026-07-29 | ~7 | **`/admin/lists` finished (18 routes → 1, +8th tab) and Slice F closed** — 7 workbenches off card soup, one commit each. Paint estimate no longer substitutes a supplier's price list. Two pre-existing `scanner` bugs fixed |
| Wed 2026-07-29 (cont. 2) | ~3 | **Preflight harness before Dennis** — 103-route smoke sweep + 16-check invariant audit, then the write flows walked through the real UI. Found CLAUDE.md's landed-cost formula missing anti-dumping, and four e-conomic trial stamps the landmine claimed didn't exist |
| Wed 2026-07-29 (cont. 3) | ~3 | **Handover docs reframed + Danish verified.** Playbook rewritten around Dennis learning the app rather than data entry; brief re-ordered to match and four stale facts fixed incl. a weekday that wasn't. Locale switch flipped to `da` and back — 103 routes, zero missing keys |

**July total: ~156 h** (20 working days)

## August 2026

| Date | Hours | Work |
|---|---|---|
| Mon 2026-08-17 | ~3 | **Prep for the Wednesday review with Dennis** — playbook + STATUS checked against reality and the 7 Aug rewrite finally committed; meeting agenda drafted; plain-language architecture + hosting-cost overview written for the meeting |
| Thu 2026-08-20 | ~1 | **Post-review session opens** — oriented from STATUS + the Aug 19 meeting plan, checked prod state (Dennis's usage since 7 Aug, the switches, the debts). Fixes and QA push from Dennis's feedback start here. |
| Sun 2026-08-23 | ~3.5 | **Login becomes a name + a password** (migrations 80 + 81): credential moved from role to person, shared password became the `Admin` person, role passwords / legacy token / `/whoami` removed, UI prefs + per-person language moved onto the person. |
| Mon 2026-08-24 | ~1 | **Template paintwork made honest** — per-bike quantity guarded at the source, the estimate decoupled from the recipe number and priced at the singles tier, with the batch ladder shown beside it. |
| Wed 2026-08-26 | ~6 | **Unit cost gets a basis** (migration 88): stock can arrive without a PO, inbound must carry a cost, outbound inherits it. Then cleared test data out of production — 15 bikes, 4 invoices — restoring 51 328,75 kr. of stock and two standing invariant hits. |

**August so far: ~14.5 h** (5 working days)

---

## September 2026

| Date | Hours | Work |
|---|---|---|
| Wed 2026-09-02 | ~9 | **SO → paint order walkable, painted parts become stock** (migrations 89–92): painter + PO documents in the supplier's language, a picker by customer order, painted variants per colour with shelf view and colour-aware builds, the TEST rule, a docs sweep, Dennis's walkthrough. |

**September so far: ~9 h** (1 working day)

---

**Project total: ~263 h across 42 working days (2026-05-07 → 2026-09-02)**
