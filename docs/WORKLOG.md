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
| Thu 2026-07-10 | ~8 | Painter price list analyzed; service model designed + SHIPPED (migs 61+62: service_orders promotion, tiered price lists, snapshot-at-send, JP-lak retired); housekeeping drill-down + mobile photo iOS fixes; worklog set up; evening: post-ship review + fixes, template cost-to-paint (mig 63) |
| Fri 2026-07-11 | ~8 | /admin/services price-list revision grid (mig 64: atomic publish RPC + tier-overlap EXCLUDE constraint); **i18n sweep launched** — foundation (next-intl, per-surface locale from app_settings), then Danish for /work + /scan, WO workspace, build workbench + batch build (worker surfaces done), app chrome, dashboard, bikes, bike templates |
| Sun 2026-07-12 | ~15.5 | i18n Danish sweep — nine modules in one long day: parts, maintenance (tickets + WOs), manufacturing-orders (+ print), purchase-orders (+ receive/line dialogs), sales-orders (+ deposit + paint-from-SO flows), paint-orders (+ items/bikes/dialogs), invoices (list + detail + actions + e-conomic sync), service agreements (list + detail + form), and customers/orgs (list, detail + sub-units/contacts/assigned-bikes, form, Leaflet customer map); shared DeliveryWeekDateField + lang namespace |
| Mon 2026-07-13 | ~4 | i18n Danish sweep — **admin cluster** (last big cluster): landing + FX rates + families (early block), then all nine admin sub-modules (categories, colours, HS/TARIC codes, kits, locations, customer segments, service price lists, settings, suppliers) — 490 keys × en/da; shared report-URL card + copy button translated (settings page now fully Danish); then the **QR pages** (`/qr/[bikeId]` single sticker + `/qr/print` sheet, `qr` namespace). Then **global-chrome leftovers** (login screen + scan FAB, `auth` namespace) and the **whole server-action error-string mop-up — COMPLETE**: shared flat `errors` namespace (~560 keys × en/da) + source-side `getTranslations` pattern (verified live in Danish); every action module localized (bikes, templates, parts, maintenance/work, MO, PO, SO, paint, invoices, orgs, service-agreements, admin) across 7 commits. Ran as parallel agents returning key maps for a central JSON merge; an API session limit mid-sweep was worked around by finishing modules directly via an exact import+replace script. **UI i18n sweep now fully closed** — flip `worker_language`/`app_language` to `da` to go live. |

| Mon 2026-07-14 | ~3 | i18n **controlled-vocab name render sweep** (the deferred piece): every vocab name (categories, bike/identifier/tax types, VAT codes, service types + part types, segments, colours, locations) now renders via `localizedName` across ~90 files — list/detail/form/print + child `_components` + `src/lib` loaders. Parent-remap pattern for pre-composed child props; parts-list view-column via lookup map; `flattenCategoryTree`/`buildParentOptions` gained a locale param; admin management lists lead localized + show the other language as subtitle; `colorFinishLabel`/`coatingLabel` call sites pass locale. Ran as parallel agents per module; a mid-run session limit killed 3 (MO/orgs-lib/colorFinishLabel) — finished directly, incl. child-component gaps the grep missed. tsc + `next build` green; browser-verified in Danish, `app_language` restored to `en`. **DB-side vocab i18n now fully closed.** Then **phone→ticket pipeline** design + **generic inbound trunk** decision (voicemail = first channel of `inbound_messages`, à la paint→service_types) + **Slice A shipped** (migration 65: `inbound_messages` + `fleet_number` id-type + private `inbound` bucket; `/admin/inbound` harness — upload-a-voicemail, list, detail w/ signed-URL audio player + pending stage panels; admin tile). Browser-verified end to end (seeded row played back via signed URL), test data cleaned. Then **config-vs-secrets doctrine** formalized (3 tiers: secrets→env, operational config→app_settings+admin, vocab→controlled-vocab) + **provider-registry seam** for the inbound pipeline (migration 66): Admin → Settings "Calls & inbound" card selects transcription/extraction/telephony provider + params, with live env-secret present/missing checks; `src/lib/inbound/settings.ts` registries. Browser-verified (section renders, save loop persists). Then **Slice D — deterministic matcher** (`src/lib/inbound/match.ts`, channel-blind: phone→contacts, org-name ILIKE, frame/QR/fleet exact, fallback org-fleet by colour/type hint; attaches org/contact/bike iff exactly-one else candidates-for-review) + extraction contract (`extraction.ts`, incl. `intent`) + harness extraction-editor & "Run matching" on the detail page. Browser-verified both paths against a seeded fixture (all-exactly-one attached; ambiguous org [10 hits] not attached, contact still matched via phone), fixture cleaned. Then closed the last hardcoded-config gap: **`DEFAULT_PAINTER_NAME` constant → `service_types.default_supplier_id`** (migration 67, FK, backfilled Metacoat for painting); migrated all 3 call sites (paint-order/new, SO paint/new, template-paint) off name-matching; new **"Default suppliers"** section at /admin/services (per-service-type supplier picker, saves on change). Browser-verified (Metacoat preselected, save loop persists). Then **Slice E — shadow-mode ticketing**: `createTicketFromInbound` turns a matched message into a draft `maintenance_ticket` (source=phone, TKT number, description from problem/transcript, priority from urgency, exactly-one bike/contact attached, bike skipped if in a build phase) → sets ticket_id + status=actioned; `TicketAction` on the detail + "from phone — review" banner on the ticket linking back; human-in-the-loop, `inbound_shadow_mode` surfaced. Browser-verified end to end (fixture → TKT-2026-0008 correct, banner renders), fixture cleaned. **Key-free path A→D→E now complete** — remaining slices B/C (Azure/Anthropic keys) + F (Twilio). |

| Tue 2026-07-15 | ~2 | Inbound **Slice C — Claude extraction** shipped: `src/lib/inbound/extract.ts` turns `body_text` → structured `InboundExtraction` via Claude Haiku forced tool-use (thin fetch wrapper, no SDK; provider+model from `app_settings`, `ANTHROPIC_API_KEY` from env; `parseExtraction` backstop). Harness gains an editable transcript ingress (`saveBodyText`) + "Run extraction" (`runExtraction`) so C→D→E is testable on hand-typed transcripts before B; extraction editor re-syncs on fresh output; button blocked-with-reason on missing key/body. Browser-verified end to end (Danish voicemail transcript → correct org/fleet(42)/intent/urgency/language, status `extracted`, matching enabled), fixture cleaned; tsc + `next build` green; en+da strings, no migration. Also: transcription-provider **re-eval → Gladia over Azure** (EU-native, cheaper, simpler signup) and external-account setup guidance (Anthropic key + Twilio trial number + Gladia signup). Then **Slice B — transcription** shipped multi-provider: `transcribe.ts` dispatches `gladia` (async signed-URL→poll; LIVE-VERIFIED on a `say`-synthesized Danish voicemail — near-perfect transcript, language=da) + `azure` (fast-transcription sync REST, contract-verified); `channels/voicemail.ts` owns recording→text; `runTranscription` + one-click `runPipeline` (transcribe→extract→match — verified end to end: org attached from real audio); migration 68 adds `inbound_phone_number_test` (Twilio trial seeded) beside the production +45 number, both in the settings telephony block, region input Azure-only; provider flipped to Gladia via the admin UI. Then **inbound → Inbox**: queue renamed ("Inbox"/"Indbakke") and moved `/admin/inbound` → `/inbox` with a Daily ops nav item next to Maintenance (it's a review surface, not admin config — provider/number config stays at /admin/settings); admin tile removed, namespace `adminInbound`→`inbox`, internal `inbound_*` names unchanged. **Pipeline A→E all shipped — only F (Twilio webhook + retention) remains.** |

**July so far: ~70 h** (11 working days)

---

**Project total: ~153.5 h across 27 working days (2026-05-07 → 2026-07-15)**
