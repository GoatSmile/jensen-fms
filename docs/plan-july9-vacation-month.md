# July 2026 work plan — the vacation month

Source: owner call 2026-07-09 (transcript in `~/Documents/1-Projects/Jensen/
Misc - Transcripts/`), processed same day. Decisions below marked **[dev]**
were made by Nazar 2026-07-09 when this plan was drawn up.

## The calendar constraint that shapes everything

- Dennis is on vacation now, **back August 3**.
- Nazar works July ("taking it easy"), **on vacation from August 4**.
- Overlap ≈ one day. So July's output must be **self-serve** — Dennis
  returns to an app he can onboard himself into (Danish, roles, polished
  maintenance/workshop flows, docs), and everything that needs the two of
  them together waits for mid-August.

## Asks sent to Dennis (can be answered from vacation, email-sized)

1. **Forward the painter's price list** (he has it — "sent me yesterday":
   per-part item numbers + prices with quantity tiers 1–9 / 10–19 / …).
   Blocks the paint remodel, the one item with money actively bleeding.
2. Nothing else blocks July. (Old-system export, role matrix details,
   invoicing walkthrough are all August items.)

## What the Jul 9 call actually changed

Most of the call was demo/confirmation of shipped work. New substance:

| # | Item | Status |
|---|------|--------|
| 1 | **Paint pricing remodel** — painter scrapped packages; every part (frame, fork, mudguards, chain guard, basket, sign, carrier…) priced individually with qty tiers; painter's numbers become item numbers | New decision, supersedes the Jul-2 std/svaj model **once shipped** |
| 2 | **i18n unparked** — Danish is a hard requirement (a workshop employee can't work in English); German is strategic for future sales | Was parked 2026-06-21, now active |
| 3 | **Roles requested** — "a login that says I can see everything, they can work on this and this and not into this" | Interim no-auth answer in July; real auth still M1-deferred |
| 4 | **Old-data migration** — the daily "whose frame/battery is this?" lookup lives in the old system | **[dev] Skipped for July** — needs export + Dennis's knowledge; whole track lands mid-August |
| 5 | **Global identifier search** — battery/frame number → bike → invoices, old-system parity | July, small |
| 6 | Housekeeping card rows should open the actual offending items | July, small |
| 7 | Mobile photo upload must work from a phone browser (Dennis fixes wrong AI-fetched images himself, from the field) | July, verify + fix |
| 8 | Maintenance + workshop floor are what Dennis learns **first** in August | July polish pass, in Danish |
| 9 | Website bike-configurator, AI lead-gen agent | Parked by Dennis himself ("lay the bottom first") |

## July tracks, sequenced

Rough capacity: ~15 dev-days at vacation-adjacent pace.

### Week 1 — quick wins + the money item
- **Housekeeping drill-down** (~0.5 d): each row on the dashboard
  housekeeping fold links to a *filtered* list showing exactly the
  offending records (parts-without-origin filter etc.), per the
  URL-driven-filters convention. Dennis asked for precisely this.
- **Mobile photo upload** (~0.5 d): verify on a real phone (camera →
  upload on part/bike), fix what's broken. Unblocks Dennis's August
  photo-cleanup habit.
- **Paint per-part price catalog** (~2 d, needs the list from Dennis):
  - New model: a paint price catalog keyed by the **painter's item
    numbers**, one row per paintable part type × quantity tier.
  - Paint order lines move from (colour, scope) to (colour, part type,
    qty) — itemized like the painter's own invoice. Cost estimate on the
    paint order = Σ line × tier price; survives partial sends (4 frames,
    5 forks).
  - Template link: a template knows which of its parts are paintable →
    "cost to paint this bike" feeds cost-to-produce + margin (the
    310→710 kr lesson: bad paint estimates ate the hotel-project margin).
  - The shipped std/svaj model (`resolveLakSkus`) stays authoritative
    until this ships — don't rip it out first, replace it in one cut.

### Weeks 2–3 — the two big tracks
- **i18n, whole app to Danish** (~4–5 d) **[dev decision: whole-app
  scope]**: next-intl foundation; worker screens first (keyed off
  `worker_language` — covers the employee who can't work in English),
  then sweep every module keyed off `app_language`; **`de` locale
  scaffolded but untranslated** (German has no user yet). Customer-facing
  documents keep their own per-document `language` — unchanged.
- **Phone→ticket pipeline v1** (~4 d) — deep dive below. Built
  harness-first; Twilio wired last.

### Week 4 — Dennis-return enablers
- **Interim device roles** (~1 d) — design below **[dev decision:
  cookie, no PIN]**.
- **Global identifier search** (~1 d): one search box (header or
  `/search?q=`) hitting `bike_identifiers` (exact/prefix), bikes (frame
  number), parts (SKU/name trigram), organizations, invoices (number) —
  grouped results, each row linking home. Old-system parity for the
  daily lookup.
- **Maintenance + workshop floor polish pass** (~1 d): walk both flows
  in Danish on a phone, fix rough edges; QR codes printable; this is
  Dennis's first-touch surface in August.
- **Handover notes** (~0.5 d): a short "what changed in July + how to
  test it" doc for Dennis's return, plus updating this plan's checkboxes.

## Deep dive: phone-call → ticket pipeline

The parked design (CLAUDE.md → Parked ideas) survives review with three
adjustments: build order, transcription provider, and an explicit
"harness-first" v1 so telephony risk lands last.

### Build order — harness first, telco last

**~80 % of the pipeline needs no phone number at all.** Everything from
"audio file exists" onward is provider-independent:

1. **Migration**: `calls` table (recording path, caller number, duration,
   language, transcript jsonb w/ timestamps, summary, extraction payload,
   candidate bikes, pipeline status enum `received → transcribed →
   extracted → matched → ticketed / failed`, nullable `ticket_id`,
   raw provider payload jsonb for replay). Plus a `fleet_number` row in
   `bike_identifier_types` (customers' own numbering — "bike 25" — big
   match-rate win for municipalities).
2. **Processing pipeline** (`src/lib/calls/`): transcribe → extract →
   match → draft ticket. Each stage writes its output + advances status,
   so a failure is resumable and inspectable.
3. **Test harness UI** (`/admin/calls`): list of calls + **"Upload a
   voicemail"** (any audio file → Supabase Storage → `calls` row) +
   per-call detail: audio player, transcript, extraction JSON, matching
   candidates, "Process now" button, "Create ticket / attach to
   existing" review actions. Record fake voicemails on a phone in Danish
   and English; iterate on extraction quality with zero telephony cost.
4. **Shadow-mode ticketing**: pipeline creates tickets with
   `source='phone'` + a "from phone — review me" banner; deterministic
   matching attaches a bike only when exactly one candidate survives,
   else stores candidates for the tech to confirm. Measure match
   accuracy on the call rows before trusting anything.
5. **Twilio wiring (last, ~1 d)**: buy DK number, conditional forwarding
   from the workshop number (busy/no-answer), TwiML voicemail flow with
   the bilingual da/en "call is recorded" announcement (GDPR), webhook
   route → store call row → **fetch recording into Supabase Storage (EU)
   → delete from Twilio immediately**. Processing trigger: inline if it
   fits the function budget, else Vercel cron each 5 min + the manual
   "Process now" button (which exists anyway from the harness).

### Provider verdicts **[dev decisions 2026-07-09]**

| Layer | Choice | Why / mitigations |
|---|---|---|
| Telephony | **Twilio** | Best docs + dev speed for a solo build. GDPR mitigations: recordings pulled to Supabase EU and deleted from Twilio at webhook time; recording announcement covers consent. EU-native fallback if this ever chafes: 46elks (Swedish, DK numbers, voice+SMS, EU residency) — swap cost is small because the provider surface is one webhook route + one recording fetch. |
| Transcription | **Azure Speech-to-Text, EU region** (or Azure-hosted Whisper) | Plain OpenAI Whisper API has no EU residency guarantee. Azure: Danish quality good, EU region explicit, per-channel transcription ready for the dual-channel v2. New env secrets: `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`. |
| Extraction | **Claude API, `claude-haiku-4-5`** | Structured output via tool use: caller, org, callback number, bike clues, problem, urgency, language. Escalate to Sonnet only if Danish extraction quality disappoints. Env: `ANTHROPIC_API_KEY`. Matching stays deterministic code, never the model. |
| SMS ack | **GatewayAPI** (Danish) | Unchanged from the parked design; v1 shadow mode sends nothing — SMS starts when tickets auto-create for real. |
| Storage | **Supabase Storage (EU)** | Already the stack; audio retention ~90 days (cron delete), transcript/summary live on the ticket. |

Secrets live in env, operational config (the workshop number, forwarding
target) in `app_settings` — `workshop_phone` already exists (migration
55) per the config-vs-secrets rule.

### Matching (unchanged from parked design — deterministic, in order)

1. Caller ID → `contacts.phone` → organization.
2. Spoken org name → trigram on `organizations.legal_name`.
3. Spoken frame / QR / **fleet number** → `bike_identifiers` exact.
4. Else: owner org's fleet filtered by colour/type clues.
Attach bike iff exactly one candidate survives; otherwise store
candidates on the call for the ticket banner.

### GDPR non-negotiables (v1)

Recording announcement (da/en) before the beep · audio retention ~90
days, then deleted (transcript + summary persist on the ticket) · DPAs:
Twilio, Microsoft, Anthropic · all storage EU · caller SMS/ack deferred
until out of shadow mode.

### Cost (unchanged estimate)

< 2 kr per 5-minute call end-to-end + ~50 kr/month for the number.

## Interim roles — device-role cookie **[dev decision: no PIN]**

Dennis's ask, minus the login nobody wants to build twice:

- **`device_role` signed httpOnly cookie**, values `owner | workshop`.
  Absent cookie = `owner` (desktops unaffected; the workshop tablet gets
  flipped once).
- **Owner-only switcher** at `/admin/device-role` (System tile): "This
  device is: Owner / Workshop".
- **One helper**: `can(role, capability)` in `src/lib/access/` — nav
  filtering (BOTH `app-sidebar.tsx` and `mobile-nav.tsx` — the two-nav
  sync rule) and layout-level route guards read only this.
- **v1 matrix (coarse)**: `workshop` sees Daily ops (Workshop floor,
  Maintenance, Bikes, Parts, Templates) and lands on `/work`; the
  Orders & commercial group, Admin, Dashboard money band are hidden and
  their routes redirect. Cost fields inside parts/templates are a v1.1
  refinement — Dennis defines the fine matrix in August ("they can work
  on this and this and not into this" — his words, his call).
- **Explicitly not security** — Vercel SSO stays the outer wall; this is
  ergonomics so a shared tablet doesn't wander into invoices. Flag: the
  workshop tablet needs a one-time Vercel SSO login (or a bypass link)
  — solve at rollout, not in code.
- **Forward-compatible by construction**: the role enum + `can()` are
  exactly M1's shape; auth later swaps the role source (cookie →
  session/`profiles.role`) and nothing else moves. The agreed M1 trigger
  (first real invoice) still stands.

## August-with-Dennis backlog (documented now, not July work)

- **Old-data migration** — export + schema mapping + import + verify,
  with Dennis's knowledge of the old system in the room. (Skipped in
  July by decision; see table above.)
- **Invoicing parity workshop** — his walk-in flow: draft → customer
  arrives → issue → mark paid → push lands in e-conomic **with a "paid"
  remark** so bookkeeping just books it. The paid-remark on the voucher
  text is a small addition to `push-invoice.ts` once the flow is agreed.
- **e-conomic production cutover** — grant token for the real agreement
  (~end of July per 3E notes), re-run Test connection, confirm journal /
  account / VAT / payment-terms numbers with the revisor, first real
  push.
- **Supplier-email go-live** — Dennis fills the 18 missing supplier
  emails (housekeeping card), `orders@valent.dk` alias created, untick
  test mode.
- **Role matrix refinement** — per-capability decisions on the cookie
  roles.
- **Service-agreement-on-bike verification** — needs real bikes in the
  system (post-migration / post data-entry).
- **Action-items dashboard fine-tuning together** — his "what needs to be
  fixed/checked" wishlist, refined against real data.

## Parked (by Dennis's own call: "lay the bottom first")

- Website bike-configurator that talks to the app (customer designs a
  bike on the homepage, colour → closest RAL, paintable parts + live
  price, "send me an offer").
- AI lead-gen agent (find nearby SMBs moving offices / hotels /
  municipalities; auto-draft outreach with the configurator link).
- Both belong to the sales track — revisit after the system is the daily
  workhorse and (Dennis's framing) once debt is down; earliest next year.
