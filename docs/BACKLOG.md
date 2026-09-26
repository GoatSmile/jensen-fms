# Backlog — parked ideas & hardening

The durable home for ideas parked mid-session (session "chips" die with the
app). Add entries with enough context to act on cold; delete an entry when
the work ships or the idea is rejected. Active/sequenced work lives in
`docs/STATUS.md`; designed work has its own `docs/plan-*.md`.

## Hardening (do as it bites)
- **Receiving a paint order whose lines name no part converts nothing — and says
  nothing.** Found 2026-09-24 in Dennis's own attempt: `PNT-2026-0008` (lines tied
  to parts) was cancelled *"fejl"*, and `PNT-2026-0012` was created with part
  types but **no `part_id` on any line**, then marked `received_back` the same
  day. No `paint_out` / `paint_in` was posted, so no painted stock appeared, and
  the screen gave no hint why — the likely "unsuccessful" attempt he described.
  Fix: warn (or refuse) at `received_back` when a stock order has lines without a
  part, naming them. Walk it through with him first; the Danish guide should show
  the flow.
- **A TEST marker should travel down the generators.** On 2026-09-15 a full
  offer → SO → MO → build → paint chain was exercised in production and **14 of
  the 20 documents carried no marker**: only the six a human typed had one, while
  the 9 bikes, 4 MOs and one paint order the app generated inherited nothing.
  The unmarked paint order was invisible to a marker-based search and surfaced
  only when a dry-run hit its foreign key. `addBikeToMO`, spawn-MO and the
  paint-order writers already copy type, template and colour from the parent —
  a parent whose notes start `TEST` should stamp its children the same way.
  Until then, finding test data needs a `created_at` sweep and someone who
  remembers the date. See DECISIONS 2026-09-15.
- **`ScriptProcessorNode` → `AudioWorklet` in the dictation recorder**
  (`src/lib/dictation/use-recorder.ts`). The capture node is formally
  deprecated; no browser has removed it or announced a date, and Munin has run
  the same code in production since August. A worklet needs a separately-served
  module file, which is real complexity for no current gain — so this is a swap
  to make when it bites, not before. Symptom to watch: a console deprecation
  that becomes an error, or silent no-op `onaudioprocess` in a browser update.
- **The dependency tree is internally inconsistent** (surfaced by CI's first
  run, 2026-07-27, pre-existing). `npm ls` reports *invalid*:
  `next-intl@4.13.2` pulls `@swc/core@1.15.43`, which wants
  `@swc/helpers >=0.5.17`, while the lock pins the `0.5.15` that `next@16.2.5`
  brought. npm 11 tolerates it (both `npm install` and `npm ci` are clean, and
  `next build` passes), npm 10's `npm ci` refuses the lock outright — which is
  why `ci.yml` pins Node 24 / npm 11. Untangling it means re-resolving a
  transitive peer range, i.e. a dependency bump on live code: worth its own
  session, not a tail-end fix. Symptom to watch: a CI failure naming
  `@swc/helpers` is this, not a code change.
- **CI Tier 2 — the runtime layer, with auth/M1.** Tier 1 (`tsc` + `lint` on
  push) shipped 2026-07-27 as `.github/workflows/ci.yml`, so the lint class no
  longer reaches prod unchecked. **The route-sweep half then shipped as a local
  script on 2026-07-29** — `npm run smoke` (`scripts/smoke-routes.mjs`) fetches
  all 103 page routes with real ids and asserts status, error-overlay markers and
  missing i18n keys. So what remains for Tier 2 is narrower than this entry used
  to say: **wire that existing script into CI** (it needs the Supabase env vars
  as repo secrets and a running server in the job, which is why it waits) and add
  the Vitest suite over the server actions, which does not exist in any form. Two lessons behind it, both the same shape: commit `fa1dbed` (a server
  component calling a `"use client"` function) and the 2026-07-27 shell bug (a
  server component *spreading* a `"use client"` export — `tsc`, `lint` and
  `next build` were all green while five create forms shipped blank defaults).
  Build it alongside auth, since auth touches every page.

  Handover note: Tier 2 is the executable half of any team handover — the
  manual browser-verification discipline the owner relies on ("I like the
  discipline") does not transfer with the repo.
- **Should CI also run `npm run check:prod`?** The schema-drift check shipped
  2026-09-04 as a local `git push` hook, which covers the one machine that
  pushes. CI would cover every route to `main`, but it needs a production
  credential as a repo secret, and `ci.yml` is deliberately secret-free ("none
  of these three steps touch the network or the database"). That trade is the
  owner's to make, not a side effect of fixing the outage that prompted it —
  the same secret question the smoke-sweep entry above is already waiting on,
  so decide both together or neither.
- **Public-action rate limits are IP-spoofable** (perimeter audit
  2026-07-23, low sev). `submit-report.ts`, `submit-general-report.ts`,
  `find-bike.ts` key their 5/hr (reports) and 30/hr (lookup) caps off the
  leftmost `x-forwarded-for` value, which is client-controllable → an
  attacker rotating the header floods `maintenance_tickets` + the public
  bike-images bucket. Damage is spam/storage cost, no data or key exposure.
  Fix: derive the key from a trusted hop (Vercel's real client IP) instead
  of raw XFF. Do when abuse appears or with the auth milestone.
- **`/api/qr/[bikeIdExt]` is a bike-existence oracle** (perimeter audit
  2026-07-23, low sev). Unauthenticated (all `/api/*` is outside both the
  SSO layer and the middleware gate); returns 404 vs 200 by row existence
  and echoes raw Postgres error text on 500. Bounded — UUIDs are
  unguessable, output is only a QR image, no writes/key. Fix: stop echoing
  DB errors; consider a generic 400. Low priority.
- **VC-1 command actions have no capability gate or rate limit** (review
  2026-07-23, low). `createCommandFromText` / `rerunCommandAgent` /
  `applyCommandAction` (src/app/inbox/_actions/command.ts) only read the
  session to STAMP a person id — no `can()` check (consistent with the whole
  app: server actions are POST endpoints behind Vercel SSO, roles are a UX
  wall). A low-cap SSO'd user could POST directly and spin the agent loop
  (Anthropic cost) or write drafts. Fix with the auth/M1 pass (cap-gate
  server actions + a per-user rate limit on agent runs). Also:
  `applyCommandAction` trusts client-supplied open-slot ids without checking
  membership in the server-rendered vocab (only the DB FK guards them) — a
  crafted request could pick a superseded (is_current=false) template. Same
  UX-wall caveat; validate slot ids against the fetched lists when auth lands.
- **Command-plan `quantity` is not an editable open slot** (found 2026-07-26
  building the sales-lead path). `DraftSalesOrderAction.quantity` is a filled
  number, so when a caller states a total but no per-type counts ("ca. 25
  cykler… nogle få elcykler… et par ladcykler"), each proposed line lands at
  qty 1 and the reviewer has to fix it on the draft SO after applying. The
  agent does say so in the line note, so nothing is silently wrong. Fix:
  promote `quantity` to a slot the CommandPlanPanel can edit before Apply —
  worth doing the first time a real multi-quantity enquiry arrives.
- SQL-side pagination + stock-status filtering for the parts list at scale
  (currently in-memory in `src/app/parts/page.tsx`).
- Offline write-queue for the workshop-floor PWA.
- Whisper voice fallback for dictation.
- Bulk CSV import for parts/suppliers.
- Dashboard service-order aging card + the service-order detail page don't
  filter by service type — fix when service type #2 becomes real.

## Providers & channels (the swappable seams)

What each capability runs on today, the realistic alternative, and why it is
parked. **Doctrine reminder (CLAUDE.md):** a new provider is an adapter behind
the stable interface plus a registry entry — never a config-only switch, and
never an unbuilt integration you can select. Munin has already paid for some of
this evaluation (`~/workspace/code/munin/docs/BACKLOG.md` → *Channels &
capabilities*); borrow it rather than re-running it, but note that Munin's live
`<Gather>` conversation constraints are NOT ours.

- **Transcription** — built: `gladia` (EU-native, the default) and `azure`
  (built, needs a region, and the only one supporting dual-channel, which is how
  bridged calls get deterministic speaker attribution). Two parked options:
  - **xAI STT** — assessed by Munin 2026-07-30: a ~90-line adapter, one REST
    POST to `api.x.ai/v1/stt`, same signed-URL input, $0.10/hr, Danish native,
    diarization included. The reason it is interesting *for us* is **keyterm
    biasing, up to 100 terms** — a direct shot at the failure that costs us
    most: mangled part names, frame numbers, customer names and Danish
    toponyms. We could feed `parts.name_en`, `bike_families`, colour names and
    `organizations.legal_name`. Parked on Munin's ground: xAI's EU residency
    and zero-retention terms are an enterprise-tier conversation, so vet the
    DPA before sending customer call audio anywhere near it.
  - **ElevenLabs Scribe v2 / AssemblyAI Universal-3** — Munin defers both
    because *streaming* needs a Twilio Media Streams bridge they would have to
    own. **That constraint is not ours**: our path is record-then-transcribe, so
    a batch REST endpoint is sufficient. If Gladia's Danish accuracy on real
    workshop calls disappoints, these are reachable for us far more cheaply than
    for Munin. Do not build until Gladia is measured and found wanting on real
    traffic — which cannot happen until a Danish number is connected.
- **Extraction (text → who / what / intent)** — built: `anthropic` only.
  **Mistral is the option worth knowing about**, and not for accuracy: Claude is
  currently the ONLY hop outside the EU anywhere in the system (audio stays in
  Europe; only the transcript leaves). An EU-resident model would make the whole
  pipeline end-to-end European. Jensen's customer segments are hospitals and
  municipalities, so a tender or a DPO asking this question is not hypothetical.
  Park it as a lever we know how to pull, not as work to do now.
- **Telephony** — built: `twilio` only. Alternatives exist (Sinch, Bird,
  46elks, Telnyx) and **none has been evaluated**, deliberately. **Relatel is
  tested first** (DECISIONS 2026-09-26): Jensen's plan (*Professional*) includes
  the API and Finn's mobile already has *Mobilfeatures*, so a free test decides
  whether Relatel replaces Twilio for Finn; if it fails, the 2026-09-24 route
  stands (option 2 → a Danish Twilio number → Finn's mobile). What we know about
  **Relatel** (Dennis's provider for the switchboard AND Finn's mobile; a TDC
  company; cloud landline numbers — the main number is landline-type, so a
  Twilio port stays *possible*, ~4 weeks, but is not needed), from their public
  docs and the Aug 2026 webhook guide:
  - Relatel records calls (main number: Contact Center/Unlimited; mobile: the
    *Mobilfeatures* add-on, automatic in and out, kept 30 days–1 year). Only the
    number's own user may listen, so the API token must be Finn's own. The API
    spec (v2.1.2) gives each call a `recording.sound.url` "if available" and
    downloads voicemails (mobile and main) as MP3 — **whether Mobilfeatures
    recordings of MOBILE calls appear in `GET /calls` is the one unknown**
    (Munr's research, 2026-09-26). The main number's one-hour manual save does
    not apply to mobile recording.
  - **Webhooks** (Contact Center/Unlimited) send `call.created` / `call.ended`
    per MAIN number, `incoming_message.created`, chat and contact events —
    **no recording event, and mobile numbers are not a subscribable resource.**
    HMAC-SHA256 signed (`t=…,v1=…`), 8 retries over ~3½ days,
    `Relatel-Delivery-Id` for dedupe. Good engineering, easy to receive.
  - Their API can **originate** a call (`POST /calls`) and send SMS.
  - If the test passes, *every* call Finn makes or takes becomes capturable
    however he dials — polled, not pushed (no mobile webhooks), mono audio
    (diarization, not channels), and no operator plays a recording notice.
  - Caller ID from municipal callers is **often hidden or cut to 5 digits**
    (Dennis, 24 Sep) — phone matching will miss them; see the notice line below.
- **"Call customer" button — Finn's outgoing calls, recorded.** Twilio rings
  Finn's mobile first, then the customer, recording dual-channel, filed on the
  ticket it was started from (pre-matched, better than inbound). Covers job
  callbacks, not calls dialled from his contacts. ~0.5–1 day on the existing
  trunk. Caller ID shows the Twilio number unless the company number is
  verified with Twilio. Rejected alternatives: on-phone recording (manual, won't
  happen consistently), softphone in the PWA (most work, unreliable on iOS in
  the background). Unnecessary if the Relatel test passes (above).
- **Relatel webhooks as a call log** — metadata only (who/when/how long) for
  main-number calls, onto the customer's timeline. Needs Contact Center or
  Unlimited. Nice-to-have; only once the Relatel subscription is known.
- **Recorded notice asks callers to identify themselves** — *"say your name,
  workplace and the bike's number"*, and voicemail asks for a callback number.
  Because hidden/short caller IDs defeat phone matching and leave no way to call
  back. One line of TwiML copy in both languages.
- **eSIM / second SIM for Finn** came up on the 24 Sep call; **nothing in the
  bridge design needs one** (Twilio rings his existing number). Find out what it
  was meant to solve before anyone buys hardware.
- **Geocoding — the one with a free win sitting on the floor.** Runtime
  geocoding is Nominatim (`src/lib/geocode/nominatim.ts`; keyless, public, and
  their policy wants a contact address in the User-Agent). But the bulk import
  already uses **DAWA** (`scripts/geocode_dawa.py` — "free, unlimited, and
  accurate on Danish addresses", with a postnr-centre fallback), and the runtime
  path never got the same treatment. Promote DAWA to the runtime geocoder with
  Nominatim kept for non-DK rows — precisely the split that script's docstring
  already describes. Small, self-contained, and strictly better for a Danish
  customer base.
- **Outbound email** — Resend, EU region, `valent.dk` verified. No reason to
  move; alternatives (Postmark, Brevo, Mailgun EU) are commodity. Revisit only
  if the free allowance stops covering us.
- **SMS** — GatewayAPI (Danish alphanumeric sender), still planned/partial.

Explicitly NOT applicable to us from Munin's list: ElevenLabs TTS and
ConversationRelay (Munin speaks back; we record and draft), per-member Google
OAuth, and the WhatsApp channel — though WhatsApp could return one day as a
*customer* channel, and Munin's research already concluded there is no ToS-safe
path to a personal inbox, so it would have to be a Jensen-owned sender.

## Parked product ideas
- **A live AI agent that answers calls and books visits** — Dennis asked
  (24 Sep) to *"test immediately"* an agent that takes calls, logs them to a
  calendar and takes notes for Finn. That is a talking agent — Munin's product
  shape (ConversationRelay, TTS), explicitly NOT ours (see *Providers &
  channels*: we record and draft). What we can show instead: recorded call →
  draft ticket → suggested calendar entry (`docs/plan-service-calendar.md`).
  A talking agent is a separate decision, not a slice of this one. Dennis's own
  stated priority for the next half year is inventory + the core program.
- **Supplier invoice capture** (discussed 2026-09-24, not yet asked of Dennis):
  first ask *which* invoices and what for. Bookkeeping → e-conomic's own voucher
  capture; don't duplicate it. Part costs → the invoice belongs on the PO:
  (1) an email address into the inbound trunk as a second channel (needs the
  mailbox; `orders@valent.dk` is already outstanding), (2) a phone-photo
  "Add invoice" on the PO page — attachments exist on PO *lines* only today,
  (3) later, extraction compares invoice vs PO and a human confirms. A one-off
  historical batch = send scans, processed once, no app work. Never "send
  pictures to the developer" as the standing process.
- **Customer duplicates to review** — ten customer names appear twice
  (Rigshospitalet, Herlev SSP, four Nybolig offices, Estate Århus C, Green
  Building Council Denmark, Mark Skibsbye, Nordicals). Import leftovers or
  genuinely two departments? Ask before the fleet import attaches bikes to
  either copy.
- **Sub-assemblies — what Dennis calls a "kit"** (escalated as a modelling
  question 2026-09-02; owner's call to escalate, not build). On the 1 Sep call
  Dennis described a kit as the frame plus the motor, cables, display and
  sensor that MUST travel together because they fit that frame — while saddle,
  handlebar, tyres and rims vary freely. That is a **sub-assembly**: a named,
  reusable group of parts inside a recipe. The app has no such concept. What it
  has instead: `kits` are colour+number sticker labels for part boxes (a floor
  picking aid, CLAUDE.md), and template reuse is "Duplicate template" / "Save
  as new version" — neither expresses "these parts belong together". Dennis's
  blocker was real: they held off building templates until "kit" was defined.
  Questions for the planning chat: (1) is a sub-assembly a **template
  fragment** (a reusable part-group that templates include by reference, so a
  motor-system change propagates) or just a **duplicate-from base template**
  (copy, then edit — no propagation, zero schema)? (2) does a sub-assembly ever
  get *built or stocked* on its own (then it is a part with its own BOM, i.e.
  a phantom/assembled part in inventory), or is it purely a recipe grouping?
  (3) does it interact with paint — the frame+fork pair already lives in
  `bike_template_service_parts`? Cheapest honest answer today: tell Dennis kits
  are box stickers and unblock with Duplicate template; decide (1)–(3) before
  anyone models it.
- **Sales track: website bike-configurator + AI lead-gen agent** (parked
  2026-07-09 by the owner — "lay the bottom first"; his framing: earliest
  next year, debt down first):
  - Homepage configurator that talks to the app. **Half of this already
    exists and is not ours**: the bike designer runs at
    `logocykler.dk/cykeldesigner` — frame, colour from a 191-entry RAL table,
    saddle, grips, box, logo. (It is NOT on jensenproduction.dk, which this
    entry used to claim; that domain just iframes jensen-cykler.dk. Survey in
    OPERATIONS.) What is missing is the link back: "send me an offer" →
    a draft offer in the FMS, with the configuration and its picture attached.
    Also unbuilt there: pick paintable parts with live pricing, which the
    per-part paint catalog now makes priceable.
  - Lead-gen agent: monitor prospect signals (e.g. companies relocating to
    nearby business parks — the owner's DXC/Nordhavn example), identify the
    right contact, auto-draft outreach with the configurator link.
  The configurator's "send me an offer" now has somewhere to land: `/offers`
  shipped 2026-09-04.
- **Price breakdown on an offer** — cost to produce (parts + paint, which the
  template box already computes) shown beside the quoted price, so the margin
  is visible while quoting rather than after. Internal only: it must never
  reach the printed or emailed document. Was bundled into the offers module
  entry; that module shipped 2026-09-04 without it.
- **Service contract on an offer → auto-add to the maintenance fleet** — the
  other rider on the old offers entry, also unbuilt. Wait for a real quote that
  includes an agreement.
- **Template retirement flag** — an `is_active` archive for a
  referenced-but-discontinued template: designed, not built; add it when
  the first real case appears (unreferenced templates can already be
  hard-deleted).
- **Category ↔ HS-code suggestion table** — deferred 2026-06-19; the
  searchable HS combobox solved the actual gripe.
