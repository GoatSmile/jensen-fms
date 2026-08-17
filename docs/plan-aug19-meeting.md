# Meeting 1 with Dennis — Wednesday 19 August, morning

Working document, ours. Not sent to Dennis.

This is **Meeting 1 of the cutover ladder** (`plan-cutover.md`): the workshop
reality check. Written assuming it happens at Jensen with a bike in front of us
— if it turns out to be at Nazar's instead, the "watch one real job" block drops
out and the invoicing-parity block from Meeting 2 moves in.

**The governing principle: his notes are the agenda.** Everything below is
fallback structure for whatever he did not write down. If he arrives with a page
of reactions, run that instead and keep only the decisions block.

---

## What the system actually says today (verified 17 Aug, not remembered)

Checked against the database rather than the docs, because the docs were written
before the stretch he has just had.

**He has been in the app.** Dennis Jensen was added as a person on 7 Aug
(`dej@jensenproduction.dk`) — step 1 of the playbook, done.

**The call bridge is pointed at a Danish mobile** — `+45 42 49 15 51`, not the
dev's test number. So the "point it at your own phone" step was followed.

**But not one call has landed since 25 July.** The last inbound message of any
kind is a `phone_call` on 2026-07-25; the last voicemail is 16 July. So the
five-minute end-to-end test either was never finished or failed silently. **This
is the single most important thing to resolve before Wednesday** — it is the
flagship feature and the one thing he was most asked to try.

**Two loose ends worth fixing before he sees them:**
- **Dennis has no role assigned.** His person row exists with zero
  `person_roles`, so the "tick Owner" half of step 1 did not take. Harmless today
  (no role passwords are set, so nothing is gated), but it means the per-role
  views cannot be demonstrated against his own name.
- **Four paint-as-part rows were created 6–7 Aug** (`J.Jensen stel 20+`,
  `skilt 20+`, `S20+`, `KS20+`), all unused — no template, no MO, no movement.
  Worth knowing whose they are: if Dennis created them, he was trying to model
  painter prices as catalogue parts, which is the pattern the services model
  deliberately replaced. That is a **discoverability finding about the app**, not
  a mistake of his — and a good thing to ask about rather than tidy away.

**Unchanged and still true:** stock on `JP-sap271` is −207 · 18 suppliers have no
email · no part has an origin or HS code · both languages still `en` · all three
safety switches still on (`inbound_shadow_mode`, `outbound_test_mode`, e-conomic
on trial) · the four e-conomic trial stamps still present.

---

## Before Wednesday (mine)

1. **Find out why no call arrived.** Twilio console logs for the trial number,
   then a bridged test call to `+45 42 49 15 51` if he is willing, or to a test
   phone. Do not walk in without an answer to this.
2. **Assign Dennis the Owner role.**
3. **Run the preflight harness** — `npm run smoke` (baseline 92 pass · 19
   redirect · 0 fail) and `scripts/audit-invariants.sql` (baseline 14 of 16;
   negative stock and the e-conomic stamps are the two standing hits).
4. **Confirm two cost facts** the overview document commits to: Gladia's free
   allowance and per-minute rate, and whether Vercel's commercial tier is
   required at $20/month.
5. **Chase the e-conomic production token** — expected end of July, now three
   weeks overdue and the long-lead item in Stage 4.

---

## Running order (half day)

**1 · What he found — 30 min, and let it overrun.**
Listen, do not present. Write every item down verbatim; sort them afterwards,
not in front of him. If he found nothing, ask what he tried to do and where he
stopped — that is the same information.

**2 · Watch one real job, start to finish — 45 min.**
The reason to be at the workshop. A real bike, a real repair or build, done his
way, with me watching and not coaching. Where the app disagrees with the bench is
where the app is wrong. Look specifically at: what is written on paper and why,
what the whiteboard carries, whether the kit stickers match the shelves.

**3 · Calls become tickets — 20 min, live.**
The flagship. Do it on his phone in the room. Then the three integration options
for his own Danish number (`phone-options-diagram.svg`), and get the three
answers I need: who carries the number, is there a phone system with desk
phones, and does he want every call captured or only the missed ones.
Recommend **Option 1** (divert on no-answer) as the starting point — reversible
in a minute, no paperwork.

**4 · What it is made of and what it costs — 20 min.**
Walk `ARCHITECTURE-OVERVIEW.md` on paper. Three things to land: everything lives
in the EU, the whole machine costs roughly 550–650 kr. a month, and nothing has
a contract longer than a month.

**This is also the moment for the account-ownership conversation** — every
account (GitHub, Vercel, Supabase, domain, phone) is in Nazar's name. It is
deliberately absent from every document he has; the diagram shows "Nazar's Mac"
twice, which opens the subject honestly without putting an ask in writing. Say
plainly what a backup on his own hardware does and does not give him: the data
and the code, not a running service.

Then the **backup location** question — is there a NAS at the workshop, and who
looks after it.

**5 · Decisions to land — 30 min.**
Do not leave the room without these seven:

| # | Decision | Default if he has no view |
|---|---|---|
| 1 | **Go-live date** | Mon 31 Aug — month end is cleanest for the books |
| 2 | **Invoice series start number** | Needs his revisor; `INV-2026-0001` is already spent on a test |
| 3 | **When each of the three switches flips** | All three at Meeting 2, both of us watching |
| 4 | **Who on the team sees what** | Owner + workshop to start; refine later |
| 5 | **Where the monthly encrypted copy lives** | His NAS if one exists; otherwise decide the alternative |
| 6 | **Account ownership** | Raise, do not resolve — he may want his accountant's view |
| 7 | **Danish or English** | Flip both to Danish; he has not set it and go-live is one setting |

**6 · Next steps, written down — 15 min.**
One list, an owner and a date against each line, read back out loud before
leaving. Half of them will be his (revisor, `orders@valent.dk`, CVR/bank
details, customer and bike data) and that is the point of reading them back.

---

## Say these out loud, unprompted

Better from me on Wednesday than discovered by him in September.

- **Stock figures are wrong and will stay wrong until the physical count.** One
  part sits at −207 because opening stock was never entered. The count on the
  go-live morning fixes it; typing will not.
- **e-conomic is still pointed at a practice account**, and the production token
  is three weeks late. It is the last rung of the ladder for exactly this reason.
- **The login is a convenience, not a lock.** Real per-user security lands with
  M1, whose agreed trigger is the first real invoice — which Stage 3 of the
  ladder trips. Worth him hearing before he puts real customer data in.
- **18 suppliers have no email address**, so purchase-order email cannot reach
  them until that is filled in. His data, quick to do, blocks Stage 2.

---

## Do not do in this meeting

- **Do not issue an invoice.** It permanently spends a number from a sequence
  that has to be gapless for his revisor, and the start number is still an open
  question (decision 2).
- **Do not flip any of the three switches.** Each sends something outward that
  cannot be recalled. They belong in Meeting 2 with both of us watching.
- **Do not promise floor/office mode by go-live.** It is approved but
  deliberately not before 31 Aug, and it reshapes the screens mechanics use
  daily.
