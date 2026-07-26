# Plan — cutover to the FMS

**Status: draft for the 17–21 Aug sessions with Dennis. Not yet agreed.**
Working document for Nazar. The owner-facing version is
`docs/CUTOVER-BRIEF.md` — that one is written to be handed over and studied;
this one holds the reasoning, the risk analysis, and the open decisions.

Companion reading: `docs/STATUS.md` (where the build stands),
`docs/OPERATIONS.md` (accounts, secrets, switches),
`docs/PLAYBOOK-AUGUST.md` (Dennis's solo stretch, which this follows).

---

## 1. What to call it

Use **cutover**. It is the standard term for the planned transition in which
the *system of record* changes hands, and it is what this actually is.

| Term | Use it for | Verdict |
|---|---|---|
| **Cutover** | The whole transition — the plan, the date, the sequence | **The right word.** Use it for this document and the event |
| **Go-live** | The moment one specific capability starts being real (invoicing go-live, email go-live) | Correct, but narrower. Use per-capability, not for the whole thing |
| **Migration** | Moving data from the old system into the new one | Correct, but it is only one workstream inside the cutover |
| **Switchover** | — | Understood by everyone, but colloquial. Fine in speech, not in the document title |
| **Turnkey** | A delivery model where a finished system is handed over ready to use | **Wrong word.** It describes how something is *sold*, not how an organisation *transitions*. Avoid it |

Danish, for when the team reads it: *idriftsættelse* for a go-live,
*systemskifte* or *overgang til nyt system* for the cutover as a whole.

## 2. The one thing that must not be staged

Everything below is staged except this: **there is a single hard date after
which no new work is recorded in Excel or on paper.** Call it the
**transfer date**.

Parallel running is the standard failure mode for a shop this size. If both
systems accept new work for a month, neither is trusted, stock figures drift
apart, and the team quietly falls back to the spreadsheet whenever the app
asks a question they don't have the answer to. The cost of a partly-wrong FMS
that everyone uses is far lower than the cost of two systems that disagree.

So: **one hard line for input, a ladder for output.** From the transfer date,
every new bike, ticket, order and PO is born in the FMS. The old system
becomes read-only history. What stays staged is which *outward-facing* and
*irreversible* capabilities are switched on, and when.

## 3. Sequencing principle: irreversibility ascending

Order the ladder by how hard each step is to undo, cheapest first.

- A wrong work order is edited in ten seconds.
- A supplier email that has already been sent cannot be unsent.
- An issued invoice number is permanent — the INV series is allocated at
  issue and issued invoices are immutable; the only correction is a credit
  note in its own `CRE-` series.
- A voucher pushed to e-conomic lands in the bookkeeping and costs the
  revisor real work to unpick.

That ordering gives the ladder in §5. It also means the two genuinely
dangerous switches (`outbound_test_mode` and the e-conomic production token)
sit deliberately late, with named sign-offs in front of them.

## 4. Three workstreams, not one

Keeping these separate is what makes the plan schedulable — they have
different owners and different blockers.

| Workstream | Owner | Blocked by |
|---|---|---|
| **Master data** — parts, suppliers, customers, templates, the bike fleet | Dennis (data entry) | Nothing. Can start 3 Aug |
| **Process** — the team stops using paper and starts using the app | Dennis + team | Master data, Danish UI, role passwords, training |
| **Systems of record** — email, phone, invoicing, accounting | Nazar (switches) + revisor (sign-off) | Master data + external items in §7 |

Master data is the long pole and it is the one thing that cannot be
compressed by working harder in August. It is also entirely self-serve today
— the dashboard "Data housekeeping" fold lists it with live counts, and
`docs/PLAYBOOK-AUGUST.md` §"Quiet-hour tasks" is already Dennis's task list
for it. **The single most useful thing he can do before 17 Aug is drive those
counts to zero.**

## 5. The ladder

Dates below are anchored to a transfer date of **Mon 31 Aug 2026** — a month
end, which is the natural line for the bookkeeping, and two weeks after the
17–21 Aug sessions. Confirm or move it in Meeting 1; everything else shifts
with it.

### Stage 0 — Foundation (3 Aug → transfer date)
Nothing real flows. Everything reversible.

- Master data to zero outstanding: supplier emails, part origins, purchase
  prices, reorder points, the 5 missing HS codes.
- Existing bike fleet loaded (see §6) — needed before service work can be
  recorded against a real bike.
- Company CVR / bank / address into `src/lib/invoicing/company.ts` (code
  change, Nazar; blocked on Dennis sending the values).
- Danish UI on (`app_language` / `worker_language` → `da`). **Do this before
  training, not after** — the team should never learn the English labels.
- Role passwords set with the team present (`/admin/people`).
- Training session on the floor.

**Gate to Stage 1:** housekeeping counts at zero, the fleet loaded, the team
has each done one real job end-to-end in the app.

### Stage 1 — Transfer date (Mon 31 Aug)
The hard line. Internal operations only; nothing leaves the building.

- Every new bike, ticket, work order, MO, sales order and PO is created in
  the FMS from this morning.
- Excel and paper become read-only reference.
- POs are drafted and printed, **not** emailed — `outbound_test_mode` stays
  on for now.
- Invoices are **not** issued yet; completed work accumulates as uninvoiced
  and shows in the dashboard money band. That is intentional and visible.

**Reversal:** stop using the app; the old process still exists. Cheap for
roughly the first week, expensive after that — which is why Stage 1 needs the
Stage 0 gate to be honest, not optimistic.

### Stage 2 — Outward-facing (≈ transfer + 1 week)
Two independent switches; do them on different days so a problem has an
obvious cause.

- **Supplier email go-live** — untick `outbound_test_mode`. Requires the
  `orders@valent.dk` mailbox to exist first, or replies bounce.
- **Phone** — Dennis's company number onto the inbound trunk, then leave
  `inbound_shadow_mode`. Graduation criteria are in
  `docs/plan-inbound-triage.md`; the Danish transcription quality question
  in `docs/plan-live-call-recording.md` is a genuine prerequisite here and
  is still open (see §8).

**Reversal:** re-tick the switch. Already-sent mail cannot be recalled, so
send the first two POs to a supplier Dennis can phone if it looks wrong.

### Stage 3 — Money (≈ transfer + 2 weeks, or first completed job)
The first real invoice. This is the point of no return.

Entry gate, all four required:
1. Invoicing-parity workshop done — the app's invoice matches what Jensen
   sends today, line for line, in wording and VAT treatment.
2. Revisor has signed off weighted-average stock valuation and deposit VAT
   timing.
3. Company details in the invoice header (from Stage 0).
4. Number series confirmed with the revisor — where the INV series starts so
   it does not collide with anything already issued this year.

**This also trips the auth decision.** The standing "not now" on M1 auth names
*the first real invoice issued* as the agreed trigger to reconsider
(`docs/STATUS.md`, DECISIONS 2026-06-24). Today the perimeter is Vercel SSO
plus a role system that is explicitly a UX wall, over permissive `anon_all`
RLS. That was a fine trade for a build phase. Issuing real invoices against
real customer data changes the calculus, and Stage 3 is where I owe the owner
a decision rather than a default. Not a blocker for the cutover — but it must
be a conscious call made at Stage 3, not something that quietly never happens.

### Stage 4 — Accounting (after 2–3 clean invoices)
e-conomic production cutover.

- Production grant token in place of the trial (expected end of July).
- **Clear any trial-stamped IDs first** — `organizations.economic_customer_number`,
  `invoices.economic_voucher_id`, `economic_synced_at`. There are none today;
  the landmine in STATUS.md exists to keep it that way. Do not push a real
  invoice to the trial agreement in the meantime.
- Revisor confirms journal, revenue account 1010, U25, payment terms.
- Push one invoice, have the revisor look at the voucher, then push the rest.

### Stage 5 — Backfill (rolling, no deadline)
Historic records enter as they become relevant, not up front. See §6.

## 6. Data migration — what actually moves

The instinct is to migrate everything. Resist it: history that nobody queries
is pure cost and pure risk.

| Data | Migrate? | Why |
|---|---|---|
| **Customers + contacts** | Yes, before transfer | Everything downstream references them |
| **Bikes in the field** | Yes, before transfer | A service ticket needs a real bike to attach to. This is the one genuinely urgent backfill |
| **Parts + suppliers** | Already in | Done; the gap is attribute completeness, not rows |
| **Current stock levels** | Yes, one counted opening balance on the transfer date | Not a migration — a stock count. See below |
| **Open orders (SO/PO/MO) at the transfer date** | Yes, by hand | Should be a small number. Re-key them; do not import |
| **Historic invoices** | **No** | They live in e-conomic and Excel. Migrating them risks polluting the INV series for no operational gain |
| **Historic repairs / service history** | **No** | Enter on demand: if a bike comes back and its past matters, add a note then |
| **Historic purchase prices** | **No** | Landed cost is frozen at purchase by design. Back-filling fake FX and tariff snapshots would be worse than having no history |

**Opening stock is a physical count, not a data task.** Pick the transfer-date
morning, count the shelves, enter the counts as inventory adjustments. Any
attempt to derive opening stock from spreadsheets will be wrong within a week
and will poison every landed-cost figure that follows. Budget half a day and
do it with the floor team.

## 7. External blockers (not ours to close)

These gate stages and none of them move by writing code. Chase them now.

| Item | Gates | Owner |
|---|---|---|
| `orders@valent.dk` mailbox / catch-all | Stage 2 email | Dennis (Google Workspace) |
| e-conomic production grant token | Stage 4 | Dennis / e-conomic |
| Revisor: stock valuation + deposit VAT | Stage 3 | Dennis → revisor |
| Revisor: e-conomic journal / account / VAT numbers | Stage 4 | Dennis → revisor |
| Revisor: INV series starting number | Stage 3 | Dennis → revisor |
| Company CVR / bank / address | Stage 3 | Dennis → Nazar |
| DA Custom Brokers on the 5 HS codes | Stage 0 (soft) | Dennis |
| Dennis's company number release for the trunk | Stage 2 phone | Dennis / telco |

The revisor appears three times. **Book that conversation once, with all
three questions on the agenda** — ideally with Nazar dialled in during
Meeting 2.

## 8. Risks worth naming

- **Master data slips and the transfer date holds anyway.** The most likely
  failure. Mitigation: the Stage 0 gate is a count, not a judgement — the
  housekeeping fold reads zero or it does not. If it does not, move the date;
  do not lower the bar.
- **Danish transcription quality is still unproven.** Our only Danish samples
  are low-clarity (the 25 Jul Gladsaxe test call scored 0.37). One clean
  Danish bridged test call is the outstanding validation, and it gates
  Stage 2's phone half. It does not gate anything else — if it stays
  unresolved, ship Stage 2's email half and leave the phone in shadow mode.
- **The team reverts under pressure.** A busy week and the paper comes back
  out. Mitigation: the transfer date is a floor rule with Dennis's name on
  it, not an IT request; and a short daily check for the first week.
- **No CI pipeline.** Manual browser verification is the only safety net
  before a deploy (`docs/BACKLOG.md`). During cutover weeks, avoid deploying
  anything not needed for the cutover.
- **Every account is in Nazar's name.** See §10 — this is the real continuity
  risk, and it is larger than the backup question that surfaced it.
- **Sales leads have nowhere to go.** The Gladsaxe test call exposed it: an
  `order_inquiry` reaching `/inbox` can only be marked handled. If real
  customer calls land on the trunk at Stage 2 and a 25-bike enquiry arrives,
  the system will lose it. Either fix the lead path before Stage 2 or keep
  the phone in shadow mode. Tracked separately.

## 9. Meeting plan — week of 17 Aug

Three sessions, deliberately in different places, for different reasons.

### Meeting 1 — at the workshop (Herlev), Mon 18 Aug, half day
**Purpose: reality check and set the transfer date.**

It has to be there because the questions are physical: where the bikes
actually are, what is on the whiteboard, how a job sheet moves across the
bench, whether the kit stickers match what is on the shelves.

1. Walk the floor. Compare the parts shelves against the catalog.
2. Watch Dennis do one real job end to end the way he does it today — silent
   observation, no coaching. Everything the app gets wrong shows up here.
3. Review the housekeeping counts together, live.
4. **Agree the transfer date** and write it down.
5. Confirm the fleet list to load (§6).

### Meeting 2 — at Nazar's, Wed 19 Aug, full day
**Purpose: the work that needs uninterrupted focus and two screens.**

It has to be here because the workshop interrupts every ten minutes, and
because the invoicing-parity workshop is genuinely hard: it is a line-by-line
comparison of a real Jensen invoice against what the app produces. Him making
the trip is also the point — this stops being a supplier delivering software
and becomes two people shipping a thing together.

1. Invoicing-parity workshop. Real invoice, side by side, until they match.
2. Revisor on the phone: stock valuation, deposit VAT, e-conomic config, INV
   series start. All four questions in one call.
3. Role matrix — who sees what — against the people-and-roles model.
4. Off-site copy: walk the runbook in §10, then **do a live restore
   rehearsal** together.
5. Sequence the ladder in §5 against real dates and write the plan he keeps.

### Meeting 3 — at the workshop, transfer date or the day before
**Purpose: the team, not the owner.**

1. Danish UI on.
2. Role passwords set with each person present.
3. Everyone does one real job in the app, watched.
4. Opening stock count.

**Between meetings:** a 30-minute video check-in every Monday. Short, standing
agenda, no slides.

## 10. Off-site copy to Jensen's own server

**Decided: on-site NAS / file server at the workshop.**

### What this is actually for
Two different things get conflated here, and only one of them is a backup.

1. **Data survivability** — if Nazar's laptop and the Supabase account both
   vanish, can Jensen reconstruct the system? This is the backup question,
   and it is the easy one: the `backup-kit` already produces exactly the
   right artefact.
2. **Account ownership** — GitHub, Vercel, Supabase, Twilio, Resend, Anthropic
   and the Dynadot DNS are all under Nazar's accounts today
   (`docs/OPERATIONS.md`). A perfect backup on Dennis's NAS does not give him
   a running service, a domain, or a phone number. **This is the bigger
   continuity risk and it deserves its own decision at Meeting 2** — either
   migrate to Jensen-owned organisation accounts, or agree a written
   arrangement with credentials in a shared Bitwarden vault. Do not let the
   backup conversation stand in for this one.

### What goes across
Reuse `backup-all`; do not build a second pipeline. Per run:

- Git bundles of the repo — full history, restorable with no GitHub account.
- `pg_dump` of the Supabase database, custom format, plus a readable
  `.sql` schema.
- Supabase storage — part photos, bike photos, voicemail audio.
- `migrations/`, `docs/`, and `backup-kit/HANDBOOK.md` + `RESTORE.md`.
- Secrets: **separately encrypted, separate password.** They are Jensen's to
  hold, but they do not belong in the same container as everything else and
  they certainly do not belong unencrypted on a network share.

### Format — one change needed
The backup kit's `secure.sparsebundle` is AES-256 and correct, but it is a
**macOS-native container**. A NAS or Windows server can store it perfectly
well and nobody there can open it. A copy Jensen cannot open on their own
hardware is theatre.

**Recommendation: produce the Dennis copy as an AES-256 encrypted `.7z`**
alongside the existing sparsebundle. 7-Zip opens on Windows, macOS, Linux and
most NAS firmware, and every IT person Dennis might call already knows it.
Small change to the backup kit; no change to the local workflow.

### Runbook (draft — walk it at Meeting 2, then move it to OPERATIONS.md)
1. On the workshop network, mount the NAS share (e.g. `//nas/jensen-fms-backup`).
2. `backup-all` with the NT_ARCHIVE drive attached — produces the current
   snapshot as normal.
3. Pack the Dennis copy: git bundles + DB dump + storage + docs into a single
   AES-256 `.7z`. Secrets into a second, separately-passworded `.7z`.
4. Copy both to the share as `jensen-fms-YYYY-MM-DD.7z` / `-secrets.7z`.
5. Keep the last 6 monthly copies; delete older ones.
6. Append a line to `RESTORE.md` on the share: date, sizes, what it contains.
7. Passwords: the archive password in Jensen's own password manager, held by
   Dennis. Never in the same place as the archive.

### Cadence
Monthly, plus one immediately before the transfer date and one immediately
after Stage 3's first real invoice. Manual is fine and honest — an automated
copy nobody checks is worse than a monthly one somebody does.

### The part to sit down and explain
Possession is not restorability. At Meeting 2, do a real rehearsal on Dennis's
machine: pull a git bundle into a fresh clone, load a dump into a scratch
Supabase project, open the app against it. Half an hour, and it converts an
abstract reassurance into something he has personally seen work.

### GDPR note
The archive contains customer contacts and call recordings. Jensen is the
controller and it is their own data on their own server, so the copy is fine
in principle — but it must stay encrypted at rest, access-controlled to named
people, and listed in whatever record of processing they keep. Retention on
the copies matches the media retention already configured in the app.

## 11. Open decisions for the 17–21 Aug sessions

1. **Transfer date** — proposed Mon 31 Aug. Confirm or move.
2. **Auth / M1** — Stage 3 trips the agreed trigger. Do we do it, defer it
   again with eyes open, or do a partial (kill `anon_all`, keep the role wall)?
3. **Account ownership** — migrate to Jensen-owned accounts, or a written
   arrangement plus a shared vault? (§10)
4. **Lead handling** — fix the `order_inquiry` dead end before Stage 2, or
   keep the phone in shadow mode until it is fixed?
5. **INV series start number** — revisor.
6. **Fleet backfill scope** — how many bikes in the field, and is there a
   list?
7. **Does the NAS exist and who administers it?** Path, protocol, capacity,
   who has credentials.
