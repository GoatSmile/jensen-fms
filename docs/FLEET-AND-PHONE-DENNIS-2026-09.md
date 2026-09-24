# What I need from you — your bikes, your agreements, and Finn's phone

> **SUPERSEDED 2026-09-24 — never sent.** Written before the 24 Sep call. The
> bike list now comes from Dennis's Trello export, not the spreadsheet this page
> mentions (deleted); the phone plan is settled in `docs/DECISIONS.md`
> (2026-09-24). Kept for the record only — do not send.

**For Dennis, 24 September 2026.** Two things we want to start soon: repair
orders on the bikes already out with your customers, and recording Finn's repair
calls. Both are waiting on information only you have. This page says exactly
what, and why.

---

## 1 · The bikes already out with your customers

**Why it matters now.** A repair order has to be attached to a real bike, and
the system only knows about the bikes built inside it. Your customers are
already in — 533 of them, with their e-conomic numbers — but the bikes they
own are not. This is the one piece of old data we genuinely need before repair
work can start.

**What I need: one list, one row per bike.** I am sending you a spreadsheet for
it (*FLEET-LIST-DENNIS-2026-09.xlsx*, explained on the second sheet). Only
**two things are required per bike**:

| Required | Why |
|---|---|
| **Which customer** it belongs to | a repair is billed to — or covered for — the owner |
| **The frame number** (*stelnummer*) | it is how we tell one bike from another, for ever |

Everything else — the customer's own fleet number, model, colour, lock and
battery numbers — is welcome but optional. **A blank is fine; a guess is not.**
And if a bike's frame number is simply unknown, still put the bike on the list:
we confirm the number the first time Finn has it in his hands.

**Already have it written down somewhere? Don't retype it.** Customer Excel
sheets, delivery notes, e-conomic invoice exports — send them as they are and I
will do the sorting. The spreadsheet is for what lives only on paper or in your
head.

## 2 · The service agreements

**Scan them.** A phone scanner app is fine. One PDF per agreement, named after
the customer. It does not matter that the old ones are in different formats: I
read each one into the system and send you a short summary to check. That check
matters, because *covered or not covered* decides whether a repair is invoiced.

**Only the agreements that are still running**, plus any expired one for a
customer who still has your bikes and might renew.

From each one the system needs:

- who it is with, and for which site if not all of them
- when it started, when it ends, and how it renews or is cancelled
- what the customer pays, and how often
- **what is covered** — parts, labour, or both — **and what is not**
  (tyres? vandalism? batteries?)
- how many service visits a year, and whether GPS is part of it

**One question I need a straight answer to:** *does any agreement cover only
some of a customer's bikes* — say 20 of their 35? Today the system treats an
agreement as covering every bike that customer (or that site) owns. If you have
agreements that don't work that way, I need to know before we load anything,
not after.

## 3 · Finn's repair line

**What we want:** a customer rings your number, hears your menu, presses 2 for
service, and reaches Finn — with the call recorded, written out, and matched to
the customer automatically so it becomes a repair ticket without anyone typing
it up.

**The part of this that already works.** It was tested on a real call in July:
the caller hears a short notice that the call is recorded, Finn's phone rings,
they talk normally, and within half a minute of hanging up the conversation is
in the system — written out, with *customer said* and *workshop said* kept
apart, and the customer found by their phone number. If Finn doesn't answer,
the caller leaves a voicemail instead, which lands in the same place.

**What is missing is connecting your number to it.** There is one rule that
decides how: *to record a call that is answered, the call must pass through our
system while it happens.* Three ways to do that:

**A · Send only "press 2" to us** — *what I recommend.* You keep your number,
your phone company and your menu exactly as they are. We ask your phone company
to send option 2 to a new Danish number of ours instead of straight to Finn.
From there we play the notice, ring Finn and record. Only repair calls are
touched, nothing is moved, and it can be switched back in minutes.

**B · Move your whole number to us** and rebuild the menu inside the system.
More control in the end — every line could be recorded and routed — but moving
a Danish number takes weeks of paperwork and just as long to undo, and it would
make us your entire phone system, sales and office included. Worth considering
later, not as the first step.

**C · Use your phone company's own call recording**, if your subscription has
it, and collect the recordings from them. Nothing about the calls changes — but
whether it is possible depends entirely on which product you have. I would only
look at this if A turns out to be impossible.

**What I need from you to go ahead with A:**

1. **Which phone company and which switchboard product** runs your menu today?
   The name on the bill is enough.
2. **Can option 2 be pointed at an outside number?** Your phone company can
   answer this in one call.
3. **When a call is passed on, does the caller's own number come with it** — or
   does it arrive showing your company number? The system finds the customer by
   their number, so this matters more than it sounds.
4. **Does Finn answer on a mobile, a desk phone or an app?** And what should
   happen out of hours — voicemail?
5. **Is Finn happy to have his calls recorded?** The caller is told at the
   start of every call; Finn should also be told in writing, which is his
   employer's job, not the system's.
6. **Should Finn's own calls *out* to customers be recorded too?** That is not
   covered by any of the above and would be a later step.

**What it costs.** A Danish number is about 15 kr. a month. Calls are charged
per minute twice — once coming in to us and once going on to Finn's mobile —
plus a small per-minute charge for writing the call out. For a repair line
alone this should come in under the 230–350 kr. a month I estimated earlier for
all your calls; one real month will turn that into a firm number.

---

**In short, the three things to send me:** the bike list (or whatever you
already have), the agreement scans, and the answers to the six phone questions
above.
