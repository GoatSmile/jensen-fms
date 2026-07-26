# Going live — what I need from you

For Dennis. Written 26 July 2026, to read before we meet in the week of
17 August.

This follows on from `docs/PLAYBOOK-AUGUST.md`, which is your guide for the
solo stretch from 3 August. That one is about using the system. This one is
about *switching to it*.

---

## The short version

**The system is ready. We should start using it for real.**

Everything the workshop does day to day is built and working: parts and
stock, purchase orders with proper landed cost, bike templates and builds,
paint orders, sales orders, repairs and work orders, invoicing, the customer
map, the phone pipeline, and the whole thing in Danish. It is not a
prototype any more, and every further month it runs alongside Excel is a
month where neither system is quite trusted.

What is left is not really software. It is three things: getting your real
data into it, getting your team used to it, and picking the date when the old
way stops. Those need you, not me — which is why I want several long sessions
with you rather than more building on my own.

So the ask is: **give me the week of 17 August, and let us agree a date when
everything starts going into the new system.** My proposal is Monday
31 August, but that is yours to confirm or move.

---

## What I need from you, in order

The order matters. Each item unblocks the ones under it, so please work down
the list rather than picking the easy ones.

### 1. Drive the housekeeping counts to zero — start now

**The ask:** Dashboard → Data housekeeping. Work the list until every count
reads 0.

**Why it matters:** This is the single thing that decides whether we can go
live at the end of August, and it is the one thing that cannot be rushed
later. It is all data that only you know — which supplier sells what at what
price, which parts come from China, when to reorder. The app is complete
without it, but it will be *quietly wrong* until it is in: purchase orders
land at 0 kr., Chinese parts show no import duty so your landed cost is
understated, and the reorder warnings stay silent because nothing knows what
"low" means.

The detailed task list with priorities is already in the August playbook. If
you do nothing else before we meet, do this.

### 2. Send me your company details

**The ask:** CVR number, bank account, and the invoice address exactly as it
should be printed.

**Why it matters:** This is a small code change on my side, but it blocks the
first real invoice, and the first real invoice is the biggest step in the
whole plan. The invoice print page currently shows a warning where these
should be. Five minutes of your time, weeks of lead time on mine if it
arrives late.

### 3. Book one conversation with your revisor

**The ask:** One meeting or call, with four questions on the agenda. Ideally
in the week of 17 August so I can join by phone.

The four questions:
- How should stock be valued? (We use weighted average — does that suit your
  accounts?)
- When is VAT due on a deposit — at the deposit, or at the final invoice?
- Which journal, revenue account and VAT code should the app post to in
  e-conomic? (I have 1010 and U25 pencilled in — please confirm.)
- What number should our invoice series start at, so it cannot collide with
  anything already issued this year?

**Why it matters:** These four answers gate the two irreversible steps in the
plan — issuing real invoices, and pushing them into e-conomic. An issued
invoice number is permanent; the only way to correct an issued invoice is a
credit note. I would much rather ask your revisor now than fix bookkeeping
later. Please treat this as one conversation with four questions, not four
separate errands.

### 4. Create the orders@valent.dk mailbox

**The ask:** In Google Workspace, create `orders@valent.dk` as an alias or
catch-all.

**Why it matters:** When we switch on supplier emailing, purchase orders go
out from that address. Until the mailbox exists, any supplier who hits reply
gets a bounce — and they will not tell us, they will just assume we did not
answer.

### 5. Chase the e-conomic production access

**The ask:** The production grant token for the app. We are on a trial
agreement today.

**Why it matters:** It is the last step of the whole plan, so there is time —
but it comes from a third party, and third parties are slow. Start it now so
it is not what we are waiting for in September.

### 6. Get me the list of bikes already out with customers

**The ask:** Whatever list exists — spreadsheet, notebook, or your memory —
of bikes currently in the field and who has them.

**Why it matters:** This is the one piece of history we genuinely have to
migrate before the switch. When a customer calls about a repair, the ticket
has to attach to a real bike in the system. Everything else — old invoices,
old repairs, old purchase prices — we deliberately leave in the old system
and never move. This is the exception.

### 7. Ask DA Custom Brokers about five parts

**The ask:** Five parts have no HS code (the Ananda motor and cable variants,
plus two small parts). Ask the broker which TARIC code they actually file
these under.

**Why it matters:** Lower priority than the rest, but worth doing while you
think of it. The broker files some parts under favourable "for cycle
manufacture" splits that avoid the 48.5% anti-dumping duty. I do not want to
guess and have our cost figures disagree with your customs paperwork.

---

## The three meetings I would like

Week of 17 August. Different places, on purpose.

### Monday 18 August — at your workshop, half a day
The reality check. I need to see the physical side: where the bikes actually
sit, what is on the whiteboard, how a job sheet travels across the bench,
whether the kit stickers match the shelves.

The important part: **I want to watch you do one real job, start to finish,
exactly the way you do it today** — while I say nothing. Every place the app
gets your process wrong will show up in that half hour and nowhere else.

Then we agree the transfer date and write it down.

### Wednesday 19 August — at my place, full day
This is the one I would most like you to travel for.

Two reasons. The practical one: the workshop interrupts you every ten
minutes, and this session needs uninterrupted focus — we are going to put a
real Jensen invoice next to one the app produces and argue about it line by
line until they match, and then get your revisor on the phone. That does not
work in fifteen-minute pieces.

The other reason is honest: I would like this to stop feeling like a supplier
delivering software to a customer. You coming here makes it two people
finishing something together, and I think we will both do better work for it.

Agenda: the invoice comparison, the revisor call, who on your team should see
which parts of the system, your own copy of everything (below), and then
writing the actual dated plan you keep.

### Transfer day or the day before — at your workshop, with the team
Not for you — for them. We switch the app to Danish, set each person's
password with them present, and have everybody do one real job while I watch.
Then we count the stock together.

**Between meetings:** a 30-minute video call every Monday. Short, no slides.

---

## How the switch actually happens

Not all at once. One hard rule and then a ladder.

**The hard rule — one date, one system for new work.** From the transfer date,
every new bike, ticket, order and purchase order is created in the app.
Excel and paper stay available to look things up, but nothing new goes into
them. Not "mostly", not "when there's time". This is the part that has to be
absolute, because two systems that half-disagree are worse than one system
that is slightly incomplete.

**The ladder — we switch things on in order of how hard they are to undo.**

| When | What starts working | Why here |
|---|---|---|
| Before the date | Danish, team passwords, all your data loaded | Nothing real happens yet; all reversible |
| **Transfer date** | All internal work: bikes, tickets, orders, stock | Mistakes are edited in seconds |
| + 1 week | Supplier emails go out for real. Your phone number onto the system | A sent email cannot be recalled |
| + 2 weeks | **The first real invoice** | An invoice number is permanent |
| After 2–3 clean invoices | e-conomic starts receiving them | Wrong bookkeeping costs your revisor real work |

Note where e-conomic sits: **last, on purpose.** It is downstream of
invoicing, which is downstream of your data. Anyone who suggests starting
with the accounting integration has the dependency backwards.

Between the transfer date and the first invoice, finished work simply piles
up as "not yet invoiced" and shows on your dashboard. That is intentional and
visible, not a problem.

**One thing to know about the stock:** opening stock is a physical count, not
a data transfer. On the morning of the transfer date we count the shelves and
type in what is actually there. Half a day with the floor team. Any attempt to
work it out from spreadsheets will be wrong within a week and will spoil every
cost figure afterwards.

---

## Your own copy of everything

You should hold a complete, independent copy of the system on your own server
— code, database, photos, call recordings, documentation. Not because I expect
anything to go wrong, but because a business should not depend on one
person's laptop.

We agreed on your on-site server. The mechanics are simple: once a month I
produce an encrypted archive and copy it to a share on your NAS, with the
password held in your own password manager, never alongside the archive. I
will bring the procedure to the 19 August session.

**The part I actually want to sit down and explain** is the difference between
*having* a copy and being able to *use* one. So at that meeting we are going
to do it for real, on your machine — unpack an archive, load the database
into a fresh test project, and open the app against it. Half an hour, and you
will have personally seen that it works rather than taking my word for it.

**One thing that copy does not solve, and we should discuss it.** GitHub,
Vercel, Supabase, the phone number, the email service and the domain are all
currently registered under my accounts. A backup gives you the data and the
code; it does not give you a running service or a phone number. That is the
larger continuity question and I would rather raise it than leave it sitting
there — so let us decide at the 19th whether to move those into Jensen-owned
accounts, or agree something in writing with shared credentials.

---

## What we decide together, not before

I have opinions on all of these, but they are yours to settle:

1. **The transfer date.** I propose Monday 31 August — a month end, which is
   cleanest for the bookkeeping.
2. **Security.** Right now the app is protected by a login layer and role
   passwords, which is right for a build phase but is not a hard security
   boundary. Once real invoices and real customer data are in it, I owe you a
   proper decision on that rather than letting it drift.
3. **Account ownership** — the point above.
4. **The phone.** Sales enquiries that arrive by phone currently have nowhere
   good to go in the system (a customer ringing about 25 bikes gets logged and
   little else). I would like to fix that before your number goes onto the
   line. It may mean the phone switch lands a bit later than the email one.
5. **Who sees what** — the role setup for your team.

---

## If it helps to know where my head is

The build phase is over. What is left is the part that only works if we do it
together, in the same room, with your real data and your real invoices in
front of us. That is why I am asking for whole days rather than calls, and
why I want a date on the calendar rather than a direction of travel.

Bring your scepticism to the 18th. The things you think the app gets wrong
about how you work are the most valuable thing you can give me.

— Nazar
